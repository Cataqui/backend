import { createHash } from "node:crypto";
import type { PmtilesArchiveRevision } from "../../../src/tiles/sources/schemas/pmtiles-archive-revision.schema";
import type { BasemapSourceRelease } from "../../../src/tiles/sources/schemas/basemap-source-release.schema";
import { readBasemapIndexHeader } from "../../../src/tiles/sources/indexes/basemap-index-manifest";
import type { BasemapIndexFile } from "../../../src/tiles/sources/indexes/schemas/basemap-index-file.schema";
import type { BasemapIndexManifest } from "../../../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";
import type { BasemapPreparedIndexReference } from "../../../src/tiles/sources/indexes/schemas/basemap-prepared-index-reference.schema";

import type { PackedLandmarkIndexReference } from "../../../src/landmark/index/schemas/packed-landmark-index-reference.schema";

export interface BasemapIndexPreparationRepository {
	readRange(params: {
		archive: PmtilesArchiveRevision;
		offset: number;
		length: number;
		signal: AbortSignal | undefined;
	}): Promise<Uint8Array>;
	putObject(params: {
		key: string;
		bytes: Uint8Array;
		contentType: string;
		signal: AbortSignal | undefined;
	}): Promise<void>;
}

// Ingestion prepares complete compressed directories, never any vector tile payloads.
export class BasemapIndexPreparationService {
	private readonly _repository: BasemapIndexPreparationRepository;

	constructor(params: { repository: BasemapIndexPreparationRepository }) {
		this._repository = params.repository;
	}
	async prepare(params: {
		release: BasemapSourceRelease;
		landmarks: PackedLandmarkIndexReference;
		signal?: AbortSignal;
	}): Promise<BasemapPreparedIndexReference> {
		params.signal?.throwIfAborted();
		const release = params.release;
		const landmarks = params.landmarks;
		const archive = {
			id: release.pmtiles.id,
			bytes: release.pmtiles.bytes,
			digest: release.pmtiles.digest,
			minZoom: release.pmtiles.minZoom,
			maxZoom: release.pmtiles.maxZoom,
		};
		const header = readBasemapIndexHeader({
			bytes: await this._range({ archive: release.pmtiles, offset: 0, length: 127, signal: params.signal }),
			archive: archive,
		});
		const written = new Set<string>();
		const headerRoot = await this._put({
			bytes: await this._range({
				archive: release.pmtiles,
				offset: 0,
				length: header.rootDirectoryOffset + header.rootDirectoryLength,
				signal: params.signal,
			}),
			written: written,
			signal: params.signal,
		});
		const leaves = [];
		for (let offset = header.leafDirectoryOffset; offset < header.leafDirectoryOffset + header.leafDirectoryLength; ) {
			const length = Math.min(8 * 1024 * 1024, header.leafDirectoryOffset + header.leafDirectoryLength - offset);
			leaves.push({
				file: await this._put({
					bytes: await this._range({ archive: release.pmtiles, offset: offset, length: length, signal: params.signal }),
					written: written,
					signal: params.signal,
				}),
				originalOffset: offset,
			});
			offset += length;
		}
		const manifest = {
			version: 1,
			archive: archive,
			landmarks: landmarks,
			metadata: { headerRoot: headerRoot, leaves: leaves },
		} satisfies BasemapIndexManifest;
		const bytes = new TextEncoder().encode(JSON.stringify(manifest));
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const reference = {
			manifestKey: `source/indexes/v1/${archive.id}/${sha256}/manifest.json`,
			sha256: sha256,
			bytes: bytes.length,
			archiveId: archive.id,
		} satisfies BasemapPreparedIndexReference;
		params.signal?.throwIfAborted();
		await this._repository.putObject({
			key: reference.manifestKey,
			bytes: bytes,
			contentType: "application/json",
			signal: params.signal,
		});
		return reference;
	}
	private async _range(params: {
		archive: PmtilesArchiveRevision;
		offset: number;
		length: number;
		signal: AbortSignal | undefined;
	}): Promise<Uint8Array> {
		params.signal?.throwIfAborted();
		const bytes = await this._repository.readRange({
			archive: params.archive,
			offset: params.offset,
			length: params.length,
			signal: params.signal,
		});
		params.signal?.throwIfAborted();
		return bytes;
	}
	private async _put(params: {
		bytes: Uint8Array;
		written: Set<string>;
		signal: AbortSignal | undefined;
	}): Promise<BasemapIndexFile> {
		params.signal?.throwIfAborted();
		const sha256 = createHash("sha256").update(params.bytes).digest("hex");
		const file = {
			path: `files/${sha256}.body`,
			sha256: sha256,
			bytes: params.bytes.length,
		} satisfies BasemapIndexFile;
		if (!params.written.has(file.path)) {
			await this._repository.putObject({
				key: `source/indexes/v1/${file.path}`,
				bytes: params.bytes,
				contentType: "application/octet-stream",
				signal: params.signal,
			});
			params.written.add(file.path);
		}
		return file;
	}
}
