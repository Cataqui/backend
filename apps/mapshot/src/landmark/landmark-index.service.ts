import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import type { Stats } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Compression, PMTiles, TileType, type Source } from "pmtiles";
import {
	AppError,
	InvalidRenderingResourceError,
	RenderingAbortedError,
	RenderingResourceUnavailableError,
} from "../errors/index";

import { PmtilesDirectoryCache } from "../tiles/pmtiles/pmtiles-directory-cache";
import type { PackedLandmarkRecord } from "./index/packed-landmark-record";
import { PackedLandmarkIndexMetadataSchema } from "./index/schemas/packed-landmark-index-metadata.schema";
import type { PackedLandmarkIndexReference } from "./index/schemas/packed-landmark-index-reference.schema";
import type { PackedLandmarkRow } from "./index/schemas/packed-landmark-row.schema";
import { LandmarkIndexRepository } from "./landmark-index.repository";

interface _Cell {
	rows: PackedLandmarkRow[];
	bytes: number;
}

export class LandmarkIndexService {
	private readonly _repository: LandmarkIndexRepository;
	private readonly _stat: Stats;
	private readonly _archive: PMTiles;
	private readonly _cache = new Map<string, _Cell>();
	private readonly _pendingCells = new Map<string, Promise<_Cell>>();
	private _cacheBytes = 0;
	private readonly _activeQueries = new Set<Promise<PackedLandmarkRecord[]>>();
	private readonly _lifecycle = new AbortController();
	private _closed = false;
	private _close: Promise<void> | undefined;

	private constructor(params: { path: string; reference: PackedLandmarkIndexReference }) {
		this._repository = new LandmarkIndexRepository({ path: params.path });
		this._stat = this._repository.stat();
		const source = {
			operationSignal: this._lifecycle.signal,
			getKey: (): string => `${params.path}:${params.reference.sha256}`,
			getBytes: async (offset, length, signal): ReturnType<Source["getBytes"]> => {
				this._checkAvailable(signal);
				if (
					!Number.isSafeInteger(offset) ||
					!Number.isSafeInteger(length) ||
					offset < 0 ||
					length < 1 ||
					(offset + length > this._stat.size && !(offset === 0 && length === 16384))
				)
					throw new InvalidRenderingResourceError();
				const bytes = new Uint8Array(Math.min(length, this._stat.size - offset));
				let read = 0;
				while (read < bytes.byteLength) {
					const count = this._repository.read({
						bytes: bytes,
						offset: read,
						length: bytes.byteLength - read,
						position: offset + read,
					});
					if (count === 0) throw new InvalidRenderingResourceError();
					read += count;
				}
				return { data: bytes.buffer, etag: params.reference.sha256 };
			},
		} satisfies Source & { operationSignal: AbortSignal };
		const cache = new PmtilesDirectoryCache({ maximumEntries: 32, maximumDecodedEntries: 262144 });
		this._archive = new PMTiles(source, cache, async (bytes, compression) => {
			if (compression !== Compression.Gzip) throw new InvalidRenderingResourceError();
			return Uint8Array.from(gunzipSync(new Uint8Array(bytes))).buffer;
		});
	}

	static async open(params: {
		path: string;
		reference: PackedLandmarkIndexReference;
		signal?: AbortSignal | undefined;
	}): Promise<LandmarkIndexService> {
		if (params.signal?.aborted) throw new RenderingAbortedError();
		let service: LandmarkIndexService | undefined;
		try {
			service = new LandmarkIndexService({ path: params.path, reference: params.reference });
			if (!service._stat.isFile() || service._stat.size !== params.reference.bytes)
				throw new InvalidRenderingResourceError();
			const header = await service._archive.getHeader();
			const metadata = PackedLandmarkIndexMetadataSchema.parse(await service._archive.getMetadata());
			const fileBytes = service._stat.size;
			const sections = [
				[header.rootDirectoryOffset, header.rootDirectoryLength],
				[header.jsonMetadataOffset, header.jsonMetadataLength],
				[header.leafDirectoryOffset, header.leafDirectoryLength],
				[header.tileDataOffset, header.tileDataLength],
			] as const;
			const validSections = sections.every(
				([offset, length]) =>
					Number.isSafeInteger(offset) &&
					offset >= 127 &&
					length !== undefined &&
					Number.isSafeInteger(length) &&
					length >= 0 &&
					offset + length <= fileBytes,
			);
			if (
				header.specVersion !== 3 ||
				header.internalCompression !== Compression.Gzip ||
				header.tileCompression !== Compression.Gzip ||
				header.tileType !== TileType.Unknown ||
				header.minZoom !== 13 ||
				header.maxZoom !== 13 ||
				header.numAddressedTiles !== metadata.cells ||
				header.numTileEntries !== metadata.cells ||
				header.numTileContents !== metadata.cells ||
				header.minLon !== -180 ||
				header.maxLon !== 180 ||
				header.minLat > -85 ||
				header.maxLat < 85 ||
				!validSections
			)
				throw new InvalidRenderingResourceError();
			if (params.signal?.aborted) throw new RenderingAbortedError();
			return service;
		} catch (error) {
			await service?.close();
			if (params.signal?.aborted) throw new RenderingAbortedError();
			if (error instanceof AppError) throw error;
			throw new InvalidRenderingResourceError();
		}
	}

	query(params: MapshotRenderInput & { signal?: AbortSignal | undefined }): Promise<PackedLandmarkRecord[]> {
		this._checkAvailable(params.signal);
		const operation = (async (): Promise<PackedLandmarkRecord[]> => {
			const extent = 8192;
			const x = ((params.center.longitude + 180) / 360) * extent;
			const y = ((1 - Math.asinh(Math.tan((params.center.latitude * Math.PI) / 180)) / Math.PI) / 2) * extent;
			const scale = extent / (512 * 2 ** params.zoom);
			// The archive contains one wrapped world; wider views must not reread the same cells.
			const halfWidth = Math.min(extent / 2, (params.size.width * scale) / 2);
			const left = Math.floor(x - halfWidth);
			const right = Math.min(Math.floor(x + halfWidth), left + extent - 1);
			const top = Math.max(0, Math.floor(y - (params.size.height * scale) / 2));
			const bottom = Math.min(extent - 1, Math.floor(y + (params.size.height * scale) / 2));
			const records: PackedLandmarkRecord[] = [];
			for (let column = left; column <= right; column++)
				for (let row = top; row <= bottom; row++) {
					this._checkAvailable(params.signal);
					const cell = { x: ((column % extent) + extent) % extent, y: row };
					const key = `${cell.x}:${cell.y}`;
					const cached = this._cache.get(key);
					let shard: _Cell;
					if (cached !== undefined) {
						this._cache.delete(key);
						this._cache.set(key, cached);
						shard = cached;
					} else {
						const pending = this._pendingCells.get(key);
						if (pending !== undefined) shard = await pending;
						else {
							const load = (async (): Promise<_Cell> => {
								const tile = await this._archive.getZxy(13, cell.x, cell.y);
								this._checkAvailable();
								const data = tile?.data;
								const rows: PackedLandmarkRow[] =
									data === undefined ? [] : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
								// JSON UTF-16 strings, arrays and object fields are conservatively budgeted beyond raw UTF-8 size.
								const retained = (data?.byteLength ?? 0) * 4 + rows.length * 1024 + 256;
								const maximumCacheBytes = 64 * 1024 * 1024;
								while (this._cache.size >= 512 || this._cacheBytes + retained > maximumCacheBytes) {
									const oldest = this._cache.entries().next().value;
									if (oldest === undefined) break;
									this._cache.delete(oldest[0]);
									this._cacheBytes -= oldest[1].bytes;
								}
								const entry = { rows: rows, bytes: retained };
								if (retained <= maximumCacheBytes) {
									this._cache.set(key, entry);
									this._cacheBytes += retained;
								}
								return entry;
							})();
							this._pendingCells.set(key, load);
							try {
								shard = await load;
							} finally {
								this._pendingCells.delete(key);
							}
						}
					}
					this._checkAvailable(params.signal);
					for (const point of shard.rows) {
						const id = `pois:${point[3]}:${point[0]}`;
						records.push({
							id: id,
							label: point[1],
							alternativeLabels: [...new Set(Object.values(point[2]))],
							coordinates: { latitude: point[6], longitude: point[5] },
							kind: point[3],
							kindDetail: point[4],
							minZoom: point[7],
							rank: point[8],
						});
					}
				}
			return records;
		})().catch((error: unknown): never => {
			if (error instanceof AppError) throw error;
			if (params.signal?.aborted) throw new RenderingAbortedError();
			throw new InvalidRenderingResourceError();
		});
		this._activeQueries.add(operation);
		void operation.finally(() => this._activeQueries.delete(operation)).catch(() => undefined);
		return operation;
	}

	private _checkAvailable(signal?: AbortSignal): void {
		if (this._closed) throw new RenderingResourceUnavailableError();
		if (signal?.aborted) throw new RenderingAbortedError();
	}
	close(): Promise<void> {
		if (this._close !== undefined) return this._close;
		this._closed = true;
		this._lifecycle.abort();
		this._close = Promise.allSettled([...this._activeQueries]).then(() => {
			this._repository.close();
			this._cache.clear();
			this._cacheBytes = 0;
		});
		return this._close;
	}
}
