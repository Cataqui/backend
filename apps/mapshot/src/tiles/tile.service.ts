import { UnrepresentableTileCoordinatesError } from "./errors/unrepresentable-tile-coordinates.error";
import { RenderingAbortedError } from "../errors/index";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { injectable } from "tsyringe";

import { MapSourceService } from "../source/map-source.service";
import type { MapTile } from "./map-tile.interface";
import { TileResourceService } from "./tile-resource.service";

@injectable()
export class TileService {
	constructor(
		private readonly _tileResourceService: TileResourceService,
		private readonly _mapSourceService: MapSourceService,
	) {}

	async loadForRender(params: { input: MapshotRenderInput; signal: AbortSignal }): Promise<MapTile[]> {
		this._checkSignal(params.signal);
		const source = (await this._mapSourceService.readSource()).pmtiles;
		this._checkSignal(params.signal);
		const input = params.input;
		const sourceZoom = Math.min(source.maxZoom, Math.max(source.minZoom, Math.floor(input.zoom)));
		const tilesPerAxis = 2 ** sourceZoom;
		const worldSize = 512 * 2 ** input.zoom;
		const centerX = ((input.center.longitude + 180) / 360) * worldSize;
		const centerY = ((1 - Math.asinh(Math.tan((input.center.latitude * Math.PI) / 180)) / Math.PI) / 2) * worldSize;
		const tileSize = 512 * 2 ** (input.zoom - sourceZoom);
		const left = Math.floor((centerX - input.size.width / 2) / tileSize);
		const right = Math.floor((centerX + input.size.width / 2 - 1e-8) / tileSize);
		const top = Math.max(0, Math.floor((centerY - input.size.height / 2) / tileSize));
		const bottom = Math.min(tilesPerAxis - 1, Math.floor((centerY + input.size.height / 2 - 1e-8) / tileSize));
		if (![left, right, top, bottom].every(Number.isSafeInteger)) throw new UnrepresentableTileCoordinatesError();

		const tiles: MapTile[] = [];
		let column = left;
		let row = top;
		while (row <= bottom) {
			this._checkSignal(params.signal);
			const locations: { address: MapTile["address"]; worldOffset: number }[] = [];
			while (locations.length < 8 && row <= bottom) {
				const wrappedColumn = ((column % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
				const distanceFromCenter = wrappedColumn * tileSize - centerX;
				const sourceIsAcrossEasternDateline = distanceFromCenter > worldSize / 2;
				const sourceIsAcrossWesternDateline = distanceFromCenter < -worldSize / 2;
				const nearestWorldCopy = sourceIsAcrossEasternDateline ? -1 : sourceIsAcrossWesternDateline ? 1 : 0;
				locations.push({
					address: { z: sourceZoom, x: wrappedColumn, y: row },
					worldOffset: Math.floor(column / tilesPerAxis) - nearestWorldCopy,
				});
				column++;
				if (column > right) {
					column = left;
					row++;
				}
			}
			const results = await Promise.allSettled(
				locations.map(async (location): Promise<MapTile> => {
					this._checkSignal(params.signal);
					const address = location.address;
					const resource = await this._tileResourceService.read({
						path: `/tiles/${source.id}/${address.z}/${address.x}/${address.y}.mvt`,
						signal: params.signal,
					});
					this._checkSignal(params.signal);
					return {
						key: `${resource.revision.path}:${resource.revision.id}`,
						address: { z: address.z, x: address.x, y: address.y },
						worldOffset: location.worldOffset,
						bytes: resource.bytes,
					};
				}),
			);
			// Complete sibling reads before allowing the request owner to drain this batch.
			for (const result of results) {
				if (result.status === "rejected") throw result.reason;
				tiles.push(result.value);
			}
		}
		return tiles;
	}

	private _checkSignal(signal: AbortSignal): void {
		if (signal.aborted) throw new RenderingAbortedError();
	}
}
