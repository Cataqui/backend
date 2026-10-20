import { RenderingResourceUnavailableError } from "../errors/index";
import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { injectable } from "tsyringe";
import type { BasemapSourceRelease } from "../tiles/sources/schemas/basemap-source-release.schema";
import { LandmarkIndexService } from "../landmark/landmark-index.service";

import { TileIndexService } from "../tiles/tile-index.service";

type _ActivatedSource = {
	tiles: TileIndexService;
	landmarks: LandmarkIndexService;
};

@injectable()
export class MapSourceService {
	private _activation: Promise<_ActivatedSource> | undefined;
	private _initialized: Promise<void> | undefined;
	private _indexes: TileIndexService["identity"] | undefined;
	private _resources: AsyncDisposableStack | undefined;
	private _closing = false;
	private _closed: Promise<void> | undefined;

	get indexes(): TileIndexService["identity"] | undefined {
		return this._closing ? undefined : this._indexes;
	}

	initialize(params: { worker?: MapshotWorkerPortal | undefined } = {}): Promise<void> {
		if (this._closing) return Promise.reject(new RenderingResourceUnavailableError());
		this._activation ??= Promise.resolve().then(async (): Promise<_ActivatedSource> => {
			await using resources = new AsyncDisposableStack();
			const tiles = await TileIndexService.open({ worker: params.worker });
			resources.defer(() => tiles.close());
			const landmarks = await LandmarkIndexService.open({
				path: tiles.landmarkIndex.path,
				reference: tiles.landmarkIndex.reference,
			});
			resources.defer(() => landmarks.close());
			await tiles.readSource();
			this._resources = resources.move();
			this._indexes = tiles.identity;
			return { tiles: tiles, landmarks: landmarks };
		});
		this._initialized ??= this._activation.then(() => undefined);
		return this._initialized;
	}

	async readSource(): Promise<BasemapSourceRelease> {
		return (await this._getActivated()).tiles.readSource();
	}

	async readResource(
		params: Parameters<TileIndexService["readResource"]>[0],
	): ReturnType<TileIndexService["readResource"]> {
		return (await this._getActivated()).tiles.readResource(params);
	}

	async queryLandmarks(
		params: Parameters<LandmarkIndexService["query"]>[0],
	): ReturnType<LandmarkIndexService["query"]> {
		return (await this._getActivated()).landmarks.query(params);
	}

	close(): Promise<void> {
		this._closing = true;
		this._closed ??= (async (): Promise<void> => {
			await this._activation?.catch(() => undefined);
			await this._resources?.disposeAsync();
		})();
		return this._closed;
	}

	private async _getActivated(): Promise<_ActivatedSource> {
		if (this._activation === undefined || this._closing) throw new RenderingResourceUnavailableError();
		const activated = await this._activation;
		if (this._closing) throw new RenderingResourceUnavailableError();
		return activated;
	}
}
