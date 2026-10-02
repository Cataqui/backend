import type { GenerateStaticMapsInput, GenerateStaticMapsResult } from "@cataqui/maps-contracts";
import type { StaticGenerationDurableObject } from "./static-generation.durable-object";
import { GeoapifyConfigSchema } from "./schemas/geoapify-config.schema";
import { StaticStyle } from "./static-style";
import { StaticOutputs, type StaticSize } from "./static-outputs";
import { createGeoapifyHttpError } from "./geoapify-http.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { MapsError } from "../../shared/maps.error";
import { StaticEncoding } from "./static-encoding";
import { StaticRepresentation } from "./static-representation";

export type StoredStaticAsset = {
	etag: string;
	uploaded: Date;
	size: number;
} & ({ kind: "body"; body: ReadableStream } | { kind: "not-modified" });

export class StaticRepository {
	constructor(
		private readonly _bindings: {
			bucket: Pick<R2Bucket, "head" | "put" | "get">;
			generation: Pick<DurableObjectNamespace<StaticGenerationDurableObject>, "getByName">;
			apiKey: string;
			images: Pick<ImagesBinding, "input" | "info">;
		},
	) {}

	async coordinateGeneration(params: {
		id: string;
		input: GenerateStaticMapsInput;
	}): Promise<GenerateStaticMapsResult> {
		return this._bindings.generation.getByName(params.id).generate(params.input);
	}

	async generateImage(params: {
		center: { latitude: number; longitude: number };
		size: StaticSize;
		signal?: AbortSignal;
	}): Promise<Uint8Array> {
		const url = new URL("https://maps.geoapify.com/v1/staticmap");
		url.search = new URLSearchParams({
			apiKey: GeoapifyConfigSchema.parse({ apiKey: this._bindings.apiKey }).apiKey,
			center: `lonlat:${params.center.longitude},${params.center.latitude}`,
			style: StaticStyle.style,
			styleCustomization: StaticStyle.styleCustomization,
			width: String(params.size.width),
			height: String(params.size.height),
			scaleFactor: String(StaticOutputs.scaleFactor),
			zoom: String(StaticStyle.zoom),
			format: StaticStyle.format,
		}).toString();

		let response: Response;
		try {
			const start = performance.now();
			response = await fetch(url, {
				signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(params.signal ? [params.signal] : [])]),
				redirect: "manual",
			});
			console.log({ event: "maps.provider.headers", durationMs: performance.now() - start });
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true });
			}
			throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true });
		}

		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			throw createGeoapifyHttpError({ response: response });
		}
		if (
			response.body === null ||
			response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/png"
		) {
			await response.body?.cancel().catch(() => undefined);
			throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false });
		}
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				size += chunk.value.length;
				if (size > 8 * 1024 * 1024) {
					await reader.cancel().catch(() => undefined);
					throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false });
				}
				chunks.push(chunk.value);
			}
		} catch (error) {
			if (error instanceof MapsError) throw error;
			throw new MapsError({
				errorCode:
					error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
						? MapsErrorCode.PROVIDER_TIMEOUT
						: MapsErrorCode.PROVIDER_UNAVAILABLE,
				retryable: true,
			});
		} finally {
			reader.releaseLock();
		}
		if (size === 0) throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false });
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		return bytes;
	}

	async findImage(params: { key: string }): Promise<boolean> {
		try {
			return (await this._bindings.bucket.head(params.key)) !== null;
		} catch {
			throw new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true });
		}
	}

	async encode(params: { bytes: Uint8Array; width: number; height: number }): Promise<Uint8Array> {
		try {
			const result = await this._bindings.images
				.input(new Blob([Uint8Array.from(params.bytes)]).stream())
				.output({ format: StaticRepresentation.contentType, quality: StaticEncoding.quality });
			const bytes = new Uint8Array(await new Response(result.image()).arrayBuffer());
			const info = await this._bindings.images.info(new Blob([bytes]).stream());
			if (info.format !== "image/webp" || info.width !== params.width || info.height !== params.height)
				throw new MapsError({ errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE, retryable: false });
			return bytes;
		} catch (error) {
			if (error instanceof MapsError) throw error;
			const invalidImage = typeof error === "object" && error !== null && "code" in error && error.code === 9412;
			throw new MapsError({ errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE, retryable: !invalidImage });
		}
	}

	async upload(params: {
		key: string;
		bytes: Uint8Array;
		width: number;
		height: number;
		revision: string;
		signal?: AbortSignal;
	}): Promise<void> {
		try {
			await this._bindings.bucket.put(params.key, params.bytes, {
				httpMetadata: {
					contentType: StaticRepresentation.contentType,
					cacheControl: StaticRepresentation.cacheControl,
				},
				customMetadata: { width: String(params.width), height: String(params.height), revision: params.revision },
			});
		} catch {
			params.signal?.throwIfAborted();
			// An interrupted write may already have stored the complete object.
			if (await this.findImage({ key: params.key })) return;
			throw new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true });
		}
	}

	async read(params: {
		key: string;
		etagDoesNotMatch?: string | undefined;
		uploadedAfter?: Date | undefined;
	}): Promise<StoredStaticAsset | null> {
		try {
			const conditions = new Headers();
			if (params.etagDoesNotMatch !== undefined) conditions.set("If-None-Match", params.etagDoesNotMatch);
			else if (params.uploadedAfter !== undefined)
				conditions.set("If-Modified-Since", params.uploadedAfter.toUTCString());
			const object = await this._bindings.bucket.get(params.key, { onlyIf: conditions });
			if (object === null) return null;
			const metadata = { etag: object.httpEtag, uploaded: object.uploaded, size: object.size };
			if (!("body" in object)) return { ...metadata, kind: "not-modified" };
			return { ...metadata, kind: "body", body: object.body };
		} catch {
			throw new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true });
		}
	}
}
