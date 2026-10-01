import { DurableObject } from "cloudflare:workers";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import { getGeoapifyConfig } from "../maps/geoapify.config";
import type { MapImageInput } from "../maps/map-image-input.interface";
import { MapRepository } from "../maps/map.repository";
import { MapService } from "../maps/map.service";
import { createImageResponse } from "./image-response";
import { ImageRepository } from "./image.repository";

type GenerationParameters = {
	key: string;
	map: MapImageInput;
	requestId: string;
};
type GeneratedImage = { bytes: Uint8Array; etag?: string };

export class ImageGenerationDurableObject extends DurableObject<GeoimageWorkerEnv> {
	private readonly _images: ImageRepository;
	private readonly _map: MapService;
	private _pending: Promise<GeneratedImage | null> | undefined;

	constructor(state: DurableObjectState, env: GeoimageWorkerEnv) {
		super(state, env);
		this._images = new ImageRepository({ bucket: env.IMAGES });
		this._map = new MapService({ repository: () => new MapRepository({ config: getGeoapifyConfig({ env: env }) }) });
	}

	async generate(
		params: GenerationParameters,
	): Promise<{ response: Response } | { errorCode: Exclude<GeoimageErrorCode, GeoimageErrorCode.VALIDATION_ERROR> }> {
		const pending = this._pending ?? this._generate(params);
		this._pending = pending;

		try {
			const image = await pending;
			if (image === null) {
				const stored = await this._images.getStoredImage({ key: params.key });
				if (stored === null) throw new GeoimageError(GeoimageErrorCode.STORAGE_UNAVAILABLE);
				return { response: stored };
			}
			let offset = 0;
			const body = new ReadableStream({
				type: "bytes",
				pull(controller) {
					const end = Math.min(offset + 64 * 1024, image.bytes.length);
					controller.enqueue(image.bytes.slice(offset, end));
					offset = end;
					if (offset === image.bytes.length) controller.close();
				},
			});
			return { response: createImageResponse({ body: body, etag: image.etag, size: image.bytes.length }) };
		} catch (error) {
			if (error instanceof GeoimageError) return { errorCode: error.errorCode };
			console.error({ event: "geoimage.generation.failed", requestId: params.requestId });
			return { errorCode: GeoimageErrorCode.INTERNAL_ERROR };
		} finally {
			if (this._pending === pending) this._pending = undefined;
		}
	}
	private async _generate(params: GenerationParameters): Promise<GeneratedImage | null> {
		// Another request may have persisted the image after the caller's initial lookup.
		const existing = await this._images.getStoredImage({ key: params.key });
		if (existing !== null) {
			await existing.body?.cancel();
			return null;
		}
		const bytes = await this._map.generateImage(params.map);
		try {
			const stored = await this._images.saveStoredImage({ key: params.key, bytes: bytes });
			return { bytes: bytes, etag: stored.etag };
		} catch {
			console.error({ event: "geoimage.storage.write.failed", requestId: params.requestId });
			return { bytes: bytes };
		}
	}
}
