import type { LandmarkService } from "../../landmarks/landmark.service";
import {
	GenerateStaticMapsResultSchema,
	type GenerateStaticMapsInput,
	type GenerateStaticMapsResult,
} from "@cataqui/maps-contracts";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { MapsError } from "../../shared/maps.error";
import { StaticEncoding } from "./static-encoding";
import { getStaticGenerationIdentity, getStaticIdentity } from "./static-identity";
import { StaticOutputs, type StaticSize } from "./static-outputs";
import type { StaticRepository, StoredStaticAsset } from "./static.repository";
import { getStaticStorageKey } from "./static-storage-key";
import { StaticStyle } from "./static-style";

interface StaticGenerationState {
	controller: AbortController;
	deadline: number;
	active: Set<Promise<unknown>>;
}

export class StaticService {
	constructor(params: {
		repository: StaticRepository;
		landmarks: LandmarkService;
		environment: string;
		baseUrl: string;
	}) {
		this._repository = params.repository;
		this._landmarks = params.landmarks;
		this._environment = params.environment;
		this._baseUrl = params.baseUrl;
	}
	private readonly _repository: StaticRepository;
	private readonly _landmarks: LandmarkService;
	private readonly _environment: string;
	private readonly _baseUrl: string;

	async generate(input: GenerateStaticMapsInput): Promise<GenerateStaticMapsResult> {
		const id = await getStaticGenerationIdentity({ input: input, environment: this._environment });
		return this._repository.coordinateGeneration({ id: id, input: input });
	}

	startPreparation(input: GenerateStaticMapsInput): {
		result: Promise<GenerateStaticMapsResult>;
		settled: Promise<void>;
	} {
		const budgetMs = 40_000;
		const generation: StaticGenerationState = {
			controller: new AbortController(),
			deadline: Date.now() + budgetMs,
			active: new Set(),
		};
		const timer = setTimeout(() => generation.controller.abort(), budgetMs);
		const result = this._prepare({ input: input, generation: generation });
		const settled = result.then(async () => {
			clearTimeout(timer);
			generation.controller.abort();
			// An expired result does not mean uncancellable binding operations have finished.
			await Promise.allSettled(generation.active);
		});
		return { result: result, settled: settled };
	}

	async findImage(params: {
		id: string;
		size: string;
		scale: string;
		zoom: string;
		etagDoesNotMatch?: string | undefined;
		uploadedAfter?: Date | undefined;
	}): Promise<StoredStaticAsset | null> {
		const size = StaticOutputs.sizes.find((size) => `${size.width}x${size.height}` === params.size);
		if (
			size === undefined ||
			params.scale !== String(StaticOutputs.scaleFactor) ||
			params.zoom !== String(StaticStyle.zoom)
		)
			return null;
		const id = await getStaticIdentity({
			assetId: params.id,
			size: size,
			scale: StaticOutputs.scaleFactor,
			zoom: StaticStyle.zoom,
		});
		return this._repository.read({
			key: getStaticStorageKey({ id: id }),
			etagDoesNotMatch: params.etagDoesNotMatch,
			uploadedAfter: params.uploadedAfter,
		});
	}

	private async _prepare(params: {
		input: GenerateStaticMapsInput;
		generation: StaticGenerationState;
	}): Promise<GenerateStaticMapsResult> {
		try {
			const id = await getStaticGenerationIdentity({ input: params.input, environment: this._environment });
			const asset = { id: id, url: new URL(`static/${id}`, this._baseUrl).toString() };
			const results = await Promise.allSettled(
				StaticOutputs.sizes.map((size) =>
					this._prepareVariant({
						input: params.input,
						assetId: id,
						size: size,
						generation: params.generation,
					}),
				),
			);
			for (const result of results) {
				if (result.status === "rejected") throw result.reason;
			}
			return { kind: "ready", asset: asset };
		} catch (error) {
			if (error instanceof MapsError) {
				const failure = GenerateStaticMapsResultSchema.safeParse({
					kind: "failed",
					code: error.errorCode,
					retryable: error.retryable,
				});
				if (failure.success) return failure.data;
			}
			console.error({ event: "maps.generation.failed" });
			return { kind: "failed", code: "INTERNAL_ERROR", retryable: false };
		}
	}

	private async _prepareVariant(params: {
		input: GenerateStaticMapsInput;
		assetId: string;
		size: StaticSize;
		generation: StaticGenerationState;
	}): Promise<void> {
		const key = getStaticStorageKey({
			id: await getStaticIdentity({
				assetId: params.assetId,
				size: params.size,
				scale: StaticOutputs.scaleFactor,
				zoom: StaticStyle.zoom,
			}),
		});
		const width = params.size.width * StaticOutputs.scaleFactor;
		const height = params.size.height * StaticOutputs.scaleFactor;
		const exists = await this._withRetries({
			generation: params.generation,
			stage: "lookup",
			operation: () => this._repository.findImage({ key: key }),
		});
		if (exists) return;
		const start = performance.now();
		const bytes = await this._withRetries({
			generation: params.generation,
			stage: "download",
			operation: () =>
				this._landmarks.generateImage({
					center: { latitude: params.input.latitude, longitude: params.input.longitude },
					size: params.size,
					signal: params.generation.controller.signal,
				}),
		});
		console.log({ event: "maps.provider.download", durationMs: performance.now() - start, bytes: bytes.byteLength });
		const encoded = await this._withRetries({
			generation: params.generation,
			stage: "encode",
			operation: () => this._repository.encode({ bytes: bytes, width: width, height: height }),
		});
		const uploadStart = performance.now();
		await this._withRetries({
			generation: params.generation,
			stage: "upload",
			operation: () =>
				this._repository.upload({
					key: key,
					bytes: encoded,
					width: width,
					height: height,
					revision: StaticEncoding.revision,
					signal: params.generation.controller.signal,
				}),
		});
		console.log({ event: "maps.upload", durationMs: performance.now() - uploadStart });
	}

	private async _withRetries<T>(params: {
		generation: StaticGenerationState;
		stage: "lookup" | "download" | "encode" | "upload";
		operation: () => Promise<T>;
	}): Promise<T> {
		for (let attempt = 0; ; attempt += 1) {
			this._checkDeadline(params.generation);
			try {
				const operation = params.operation();
				params.generation.active.add(operation);
				void operation.then(
					() => params.generation.active.delete(operation),
					() => params.generation.active.delete(operation),
				);
				return await this._bounded({ generation: params.generation, operation: operation });
			} catch (error) {
				this._checkDeadline(params.generation);
				if (!(error instanceof MapsError) || !error.retryable) throw error;
				if (attempt === 2) {
					console.log({ event: "maps.retry.exhausted", stage: params.stage, attempt: attempt + 1, reason: "attempts" });
					throw error;
				}
				const delayMs = (error.retryAfterMs ?? 1_000 * 2 ** attempt) + Math.floor(Math.random() * 251);
				if (delayMs >= params.generation.deadline - Date.now()) {
					console.log({
						event: "maps.retry.exhausted",
						stage: params.stage,
						attempt: attempt + 1,
						reason: "delay_exceeds_budget",
					});
					throw error;
				}
				console.log({ event: "maps.retry.wait", stage: params.stage, attempt: attempt + 1, delayMs: delayMs });
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					await this._bounded({
						generation: params.generation,
						operation: new Promise<void>((resolve) => {
							timer = setTimeout(resolve, delayMs);
						}),
					});
				} finally {
					clearTimeout(timer);
				}
			}
		}
	}

	private _checkDeadline(generation: StaticGenerationState): void {
		if (generation.controller.signal.aborted || Date.now() >= generation.deadline) {
			console.log({ event: "maps.retry.exhausted", reason: "deadline" });
			generation.controller.abort();
			throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true });
		}
	}

	private async _bounded<T>(params: { generation: StaticGenerationState; operation: Promise<T> }): Promise<T> {
		this._checkDeadline(params.generation);
		let onAbort = () => {};
		const expired = new Promise<never>((_, reject) => {
			onAbort = () => reject(new MapsError({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true }));
			params.generation.controller.signal.addEventListener("abort", onAbort, { once: true });
		});
		try {
			return await Promise.race([params.operation, expired]);
		} finally {
			params.generation.controller.signal.removeEventListener("abort", onAbort);
		}
	}
}
