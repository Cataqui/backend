import { BasemapIndexIntegrityError } from "./basemap-index-integrity.error";

import { bytesToHeader, Compression, TileType, type Header } from "pmtiles";

import type { BasemapIndexManifest } from "./schemas/basemap-index-manifest.schema";
import type { BasemapIndexFile } from "./schemas/basemap-index-file.schema";

/** Header geometry is an independent provider boundary used by preparation and installation. */
export function readBasemapIndexHeader(params: {
	bytes: Uint8Array;
	archive: BasemapIndexManifest["archive"];
}): Header & { leafDirectoryLength: number; tileDataLength: number } {
	if (
		params.bytes.length < 127 ||
		new TextDecoder().decode(params.bytes.subarray(0, 7)) !== "PMTiles" ||
		params.bytes[7] !== 3
	)
		throw new BasemapIndexIntegrityError();
	const header = bytesToHeader(Uint8Array.from(params.bytes.subarray(0, 127)).buffer);
	if (
		header.leafDirectoryLength === undefined ||
		header.tileDataLength === undefined ||
		header.tileType !== TileType.Mvt ||
		![Compression.None, Compression.Gzip].includes(header.internalCompression) ||
		![Compression.None, Compression.Gzip].includes(header.tileCompression) ||
		header.minZoom !== params.archive.minZoom ||
		header.maxZoom !== params.archive.maxZoom ||
		![
			header.rootDirectoryOffset,
			header.rootDirectoryLength,
			header.leafDirectoryOffset,
			header.leafDirectoryLength,
			header.tileDataOffset,
			header.tileDataLength,
		].every(Number.isSafeInteger) ||
		header.rootDirectoryOffset < 127 ||
		header.rootDirectoryLength < 1 ||
		header.rootDirectoryOffset + header.rootDirectoryLength > 16384 ||
		header.leafDirectoryLength < 0 ||
		(header.leafDirectoryLength > 0 &&
			header.leafDirectoryOffset < header.rootDirectoryOffset + header.rootDirectoryLength) ||
		!Number.isSafeInteger(header.leafDirectoryOffset + header.leafDirectoryLength) ||
		header.leafDirectoryOffset + header.leafDirectoryLength > params.archive.bytes ||
		header.tileDataOffset < header.rootDirectoryOffset + header.rootDirectoryLength ||
		(header.leafDirectoryLength > 0 &&
			header.leafDirectoryOffset < header.tileDataOffset + header.tileDataLength &&
			header.tileDataOffset < header.leafDirectoryOffset + header.leafDirectoryLength) ||
		header.tileDataLength < 1 ||
		!Number.isSafeInteger(header.tileDataOffset + header.tileDataLength) ||
		header.tileDataOffset + header.tileDataLength > params.archive.bytes
	)
		throw new BasemapIndexIntegrityError();
	return { ...header, leafDirectoryLength: header.leafDirectoryLength, tileDataLength: header.tileDataLength };
}

export function getBasemapIndexFiles(params: { manifest: BasemapIndexManifest }): BasemapIndexFile[] {
	const files = new Map<string, BasemapIndexFile>();
	for (const file of [
		params.manifest.metadata.headerRoot,
		...params.manifest.metadata.leaves.map((leaf) => leaf.file),
	]) {
		const existing = files.get(file.path);
		if (existing !== undefined && (existing.bytes !== file.bytes || existing.sha256 !== file.sha256))
			throw new BasemapIndexIntegrityError();
		files.set(file.path, file);
	}
	return [...files.values()];
}
