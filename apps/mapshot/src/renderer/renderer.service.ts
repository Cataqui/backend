import { RendererImageDimensionsMismatchError } from "./errors/renderer-image-dimensions-mismatch.error";
import { RendererReadinessImageDimensionsError } from "./errors/renderer-readiness-image-dimensions.error";
import { RendererResponseInvalidError } from "./errors/renderer-response-invalid.error";
import { RendererResponseIdMismatchError } from "./errors/renderer-response-id-mismatch.error";
import { RendererRejectedError } from "./errors/renderer-rejected.error";
import { RendererImageOutputInvalidError } from "./errors/renderer-image-output-invalid.error";
import { RendererTextCoverageInvalidError } from "./errors/renderer-text-coverage-invalid.error";
import { RendererRenderFailedError } from "./errors/renderer-render-failed.error";
import { RendererInitializationFailedError } from "./errors/renderer-initialization-failed.error";
import { AppError, RenderingAbortedError, RenderingClosedError } from "../errors/index";
import { PlaceCategoryStyle } from "@cataqui/places/style";
import { createHash } from "node:crypto";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import type { LandmarkOutput } from "../landmark/schemas/landmark-output.schema";
import { LandmarkStyle } from "../landmark/landmark-style";
import { StaticRenderingPolicy } from "../map/static-rendering-policy";
import type { MapTile } from "../tiles/map-tile.interface";
import { EngineAssetsService } from "./engine-assets.service";
import type { RenderedImage } from "./rendered-image.interface";
import { AsyncQueue } from "@cataqui/async";
import { injectable } from "tsyringe";

import type { EngineMapRenderInput } from "./engine-map-render-input.interface";
import { EngineResponseOutputSchema } from "./schemas/engine-response-output.schema";
import { EngineRenderOutputSchema, type EngineRenderOutput } from "./schemas/engine-render-output.schema";

import { RendererProcessRepository, type RendererProcessResponse } from "./renderer-process.repository";

@injectable()
export class RendererService {
	constructor(
		private readonly _repository: RendererProcessRepository,
		private readonly _engineAssetsService: EngineAssetsService,
	) {}
	private _closing = false;
	private readonly _queue = new AsyncQueue();
	private readonly _words = new Intl.Segmenter(undefined, { granularity: "word" });
	private readonly _graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

	async start(params: { signal: AbortSignal }): Promise<void> {
		await this._enqueue({
			signal: params.signal,
			execute: async (): Promise<void> => this._ensureStarted({ signal: params.signal }),
		});
	}

	async render(params: {
		input: MapshotRenderInput;
		tiles: MapTile[];
		landmarks: LandmarkOutput[];
		signal: AbortSignal;
	}): Promise<RenderedImage> {
		return this._enqueue({
			signal: params.signal,
			execute: async (): Promise<RenderedImage> => {
				const candidates: EngineMapRenderInput["landmarks"]["candidates"] = [];
				for (const landmark of params.landmarks) {
					const badge = this._engineAssetsService.badges.get(landmark.category);
					if (badge === undefined) continue;
					const labels: EngineMapRenderInput["landmarks"]["candidates"][number]["labels"] = [];
					for (const text of [landmark.label, ...landmark.alternativeLabels]) {
						const wordEnds: number[] = [];
						const graphemeEnds: number[] = [];
						let bytes = 0;
						for (const part of this._words.segment(text)) {
							bytes += Buffer.byteLength(part.segment);
							wordEnds.push(bytes);
						}
						bytes = 0;
						for (const part of this._graphemes.segment(text)) {
							bytes += Buffer.byteLength(part.segment);
							graphemeEnds.push(bytes);
						}
						labels.push({ text: text, wordEnds: wordEnds, graphemeEnds: graphemeEnds });
					}
					candidates.push({
						id: `landmark:${landmark.id}`,
						labels: labels,
						coordinates: { latitude: landmark.coordinates.latitude, longitude: landmark.coordinates.longitude },
						badge: { path: badge.path, logicalSize: badge.logicalSize },
						textColor: PlaceCategoryStyle[landmark.category].textColor,
						rank: landmark.rank,
						sourceMinZoom: landmark.sourceMinZoom,
					});
				}
				const map = {
					camera: {
						latitude: params.input.center.latitude,
						longitude: params.input.center.longitude,
						zoom: params.input.zoom,
						width: params.input.size.width,
						height: params.input.size.height,
						pixelRatio: StaticRenderingPolicy.density,
					},
					tiles: params.tiles.map((tile) => ({
						key: tile.key,
						address: { z: tile.address.z, x: tile.address.x, y: tile.address.y },
						worldOffset: tile.worldOffset,
						bytes: Buffer.from(tile.bytes.buffer, tile.bytes.byteOffset, tile.bytes.byteLength).toString("base64"),
					})),
					landmarks: {
						candidates: candidates,
						style: {
							badgeRadius: LandmarkStyle.badgeRadius,
							badgeStrokeWidth: LandmarkStyle.badgeStrokeWidth,
							labelGap: LandmarkStyle.labelGap,
							edgeMargin: LandmarkStyle.edgeMargin,
							labelFontSize: LandmarkStyle.labelFontSize,
							labelMaxWidth: LandmarkStyle.labelMaxWidth,
							labelMaxLines: LandmarkStyle.labelMaxLines,
							labelLineHeight: LandmarkStyle.labelLineHeight,
							labelLetterSpacing: LandmarkStyle.labelLetterSpacing,
							labelHaloWidth: LandmarkStyle.labelHaloWidth,
						},
					},
				} satisfies EngineMapRenderInput;
				await this._ensureStarted({ signal: params.signal });
				try {
					const response = await this._repository.request({
						operation: { op: "render", map: map },
						signal: params.signal,
					});
					if (params.signal.aborted) throw new RenderingAbortedError();
					const rendered = this._decodeRender(this._validateResponse(response));
					if (
						rendered.pixelWidth !== params.input.size.width * StaticRenderingPolicy.density ||
						rendered.pixelHeight !== params.input.size.height * StaticRenderingPolicy.density
					)
						throw new RendererImageDimensionsMismatchError();
					return {
						bytes: rendered.bytes,
						metadata: {
							contentType: "image/webp",
							digest: createHash("sha256").update(rendered.bytes).digest("hex"),
							pixelWidth: rendered.pixelWidth,
							pixelHeight: rendered.pixelHeight,
						},
						diagnostics: rendered.diagnostics,
					};
				} catch (error) {
					await this._repository.kill();
					throw this._knownOperationError({ error: error, signal: params.signal }) ?? new RendererRenderFailedError();
				}
			},
		});
	}

	async close(): Promise<void> {
		this._closing = true;
		await this._queue.wait();
		await this._repository.close();
	}

	private async _enqueue<T>(params: { signal: AbortSignal; execute: () => Promise<T> }): Promise<T> {
		if (this._closing) throw new RenderingClosedError();
		return this._queue.enqueue(async () => {
			if (params.signal.aborted) throw new RenderingAbortedError();
			return params.execute();
		});
	}

	private async _ensureStarted(params: { signal: AbortSignal }): Promise<void> {
		if (this._repository.running) return;
		try {
			await this._repository.start();
			const readiness = await this._repository.request({ operation: { op: "ready" }, signal: params.signal });
			if (params.signal.aborted) throw new RenderingAbortedError();
			const image = this._decodeRender(this._validateResponse(readiness));
			if (image.pixelWidth !== 16 || image.pixelHeight !== 16) throw new RendererReadinessImageDimensionsError();
		} catch (error) {
			await this._repository.kill();
			throw (
				this._knownOperationError({ error: error, signal: params.signal }) ?? new RendererInitializationFailedError()
			);
		}
	}

	private _validateResponse(response: RendererProcessResponse): unknown {
		const parsed = EngineResponseOutputSchema.safeParse(response.value);
		if (!parsed.success) throw new RendererResponseInvalidError();
		const reply = parsed.data;
		if (reply.id !== response.id) throw new RendererResponseIdMismatchError();
		if (!reply.ok) throw new RendererRejectedError();
		return reply;
	}

	private _decodeRender(value: unknown): {
		bytes: Buffer<ArrayBuffer>;
		pixelWidth: number;
		pixelHeight: number;
		diagnostics: EngineRenderOutput["metrics"];
	} {
		const parsed = EngineRenderOutputSchema.safeParse(value);
		if (!parsed.success) throw new RendererImageOutputInvalidError();
		const response = parsed.data;
		const bytes = Buffer.from(response.imageBase64, "base64");
		if (response.metrics.missingGlyphs !== 0 || response.metrics.unsupportedLabels !== 0)
			throw new RendererTextCoverageInvalidError();
		return {
			bytes: bytes,
			pixelWidth: response.width,
			pixelHeight: response.height,
			diagnostics: response.metrics,
		};
	}

	private _knownOperationError(params: { error: unknown; signal: AbortSignal }): AppError | undefined {
		if (params.signal.aborted) return new RenderingAbortedError();
		if (params.error instanceof AppError) return params.error;
		if (params.error instanceof SyntaxError || params.error instanceof TypeError)
			return new RendererResponseInvalidError();
		return undefined;
	}
}
