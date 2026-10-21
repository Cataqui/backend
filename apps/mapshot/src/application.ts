import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { injectable } from "tsyringe";
import { MapService } from "./map/map.service";
import { RendererService } from "./renderer/renderer.service";
import { MapSourceService } from "./source/map-source.service";
import { TileResourceService } from "./tiles/tile-resource.service";

@injectable()
export class MapshotApplication {
	private readonly _shutdown = new AbortController();
	private _initialized: Promise<void> | undefined;
	private _closed: Promise<void> | undefined;
	private _cleanup: AsyncDisposableStack | undefined;
	private _ready = false;

	constructor(
		private readonly _mapService: MapService,
		private readonly _mapSourceService: MapSourceService,
		private readonly _tileResourceService: TileResourceService,
		private readonly _rendererService: RendererService,
	) {}

	get signal(): AbortSignal {
		return this._shutdown.signal;
	}

	get ready(): boolean {
		return this._ready && !this.signal.aborted;
	}

	get indexes(): MapSourceService["indexes"] {
		return this.ready ? this._mapSourceService.indexes : undefined;
	}

	initialize(params: { worker?: MapshotWorkerPortal | undefined } = {}): Promise<void> {
		if (this.signal.aborted) return Promise.resolve();
		this._initialized ??= (async (): Promise<void> => {
			await using cleanup = new AsyncDisposableStack();
			cleanup.defer(async (): Promise<void> => this._mapSourceService.close());
			cleanup.defer(async (): Promise<void> => this._tileResourceService.close());
			cleanup.defer(async (): Promise<void> => this._rendererService.close());
			cleanup.defer(async (): Promise<void> => this._mapService.close());
			const sourceInitialization = this._mapSourceService.initialize({ worker: params.worker });
			const rendererInitialization = this._rendererService.start({
				signal: AbortSignal.any([this.signal, AbortSignal.timeout(30_000)]),
			});
			const [source, renderer] = await Promise.allSettled([sourceInitialization, rendererInitialization]);
			if (source.status === "rejected") throw source.reason;
			if (renderer.status === "rejected") throw renderer.reason;
			this._cleanup = cleanup.move();
			this._ready = true;
		})();
		return this._initialized;
	}

	close(): Promise<void> {
		this._shutdown.abort();
		this._closed ??= (async (): Promise<void> => {
			await this._initialized?.catch(() => undefined);
			this._ready = false;
			await this._cleanup?.disposeAsync();
		})();
		return this._closed;
	}
}
