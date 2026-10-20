import { RenderingAbortedError, RenderingClosedError } from "../errors/index";
import { AsyncQueue } from "@cataqui/async";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { injectable } from "tsyringe";

import { LandmarkService } from "../landmark/landmark.service";
import type { RenderedImage } from "../renderer/rendered-image.interface";
import { RendererService } from "../renderer/renderer.service";
import { TileService } from "../tiles/tile.service";

@injectable()
export class MapService {
	private readonly _queue = new AsyncQueue({ concurrencyLimit: 1 });
	private _closing = false;
	private _closed: Promise<void> | undefined;

	constructor(
		private readonly _tileService: TileService,
		private readonly _landmarkService: LandmarkService,
		private readonly _rendererService: RendererService,
	) {}

	async render(params: { input: MapshotRenderInput; signal?: AbortSignal | undefined }): Promise<RenderedImage> {
		if (this._closing) throw new RenderingClosedError();

		return this._queue.enqueue(async (): Promise<RenderedImage> => {
			if (params.signal?.aborted) throw new RenderingAbortedError();
			const cancellation = new AbortController();
			const signal =
				params.signal === undefined ? cancellation.signal : AbortSignal.any([params.signal, cancellation.signal]);
			const tiles = this._tileService.loadForRender({ input: params.input, signal: signal });
			const landmarks = this._landmarkService.findForRender({ input: params.input, signal: signal });

			try {
				const [loadedTiles, foundLandmarks] = await Promise.all([tiles, landmarks]);

				if (signal.aborted) throw new RenderingAbortedError();
				const image = await this._rendererService.render({
					input: params.input,
					tiles: loadedTiles,
					landmarks: foundLandmarks,
					signal: signal,
				});

				if (signal.aborted) throw new RenderingAbortedError();
				return image;
			} finally {
				cancellation.abort();
				await Promise.allSettled([tiles, landmarks]);
			}
		});
	}

	close(): Promise<void> {
		this._closing = true;
		this._closed ??= this._queue.wait();
		return this._closed;
	}
}
