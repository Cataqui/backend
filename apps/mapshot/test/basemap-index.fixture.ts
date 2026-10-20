import * as td from "testdouble";
import type { BasemapIndexPreparationRepository } from "../build/data/indexes/basemap-index-preparation.service";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
	BasemapSourceReleaseSchema,
	type BasemapSourceRelease,
} from "../src/tiles/sources/schemas/basemap-source-release.schema";
import { BasemapIndexPreparationService } from "../build/data/indexes/basemap-index-preparation.service";
import {
	BasemapIndexManifestSchema,
	type BasemapIndexManifest,
} from "../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";
import type { BasemapPreparedIndexReference } from "../src/tiles/sources/indexes/schemas/basemap-prepared-index-reference.schema";
import { createPackedLandmarkIndexFixture } from "./landmark-index.fixture";

export function indexFixtureSha(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Complete tiny PMTiles archive with one gzip root, leaf and tile; no upstream data. */
export async function createIndexFixture(
	params: { rootOnly?: boolean; largeLeaves?: boolean; splitLeaf?: boolean; leavesAfterTiles?: boolean } = {},
): Promise<{
	raw: Uint8Array<ArrayBuffer>;
	tile: Buffer<ArrayBuffer>;
	bytes: Uint8Array<ArrayBuffer>;
	release: BasemapSourceRelease;
	objects: Map<string, Uint8Array>;
	ranges: Array<{ offset: number; length: number }>;
	repository: BasemapIndexPreparationRepository & { readObject(input: { key: string }): Promise<Uint8Array> };
	reference: BasemapPreparedIndexReference;
	manifest: BasemapIndexManifest;
	landmarks: ReturnType<typeof createPackedLandmarkIndexFixture>;
	tileOffset: number;
}> {
	const raw = Uint8Array.of(10, 11, 12, 13);
	const tile = gzipSync(raw);
	const leaf = gzipSync(Uint8Array.of(1, 0, 1, tile.length, 1));
	const placement = params.splitLeaf === true ? 8 * 1024 * 1024 - 10 : 0;
	const values: number[] = [];
	for (let value of [1, 0, 0, leaf.length, placement + 1]) {
		while (value >= 128) {
			values.push((value % 128) + 128);
			value = Math.floor(value / 128);
		}
		values.push(value);
	}
	const root = params.rootOnly === true ? leaf : gzipSync(Uint8Array.from(values));
	const leafBytes =
		params.rootOnly === true
			? 0
			: params.largeLeaves === true || params.splitLeaf === true
				? 8 * 1024 * 1024 + leaf.length
				: leaf.length;
	const tileOffset = params.leavesAfterTiles === true ? 16384 : 16384 + leafBytes;
	const leafOffset = params.leavesAfterTiles === true ? 16384 + tile.length : 16384;
	const bytes = new Uint8Array(16384 + leafBytes + tile.length);
	bytes.set(new TextEncoder().encode("PMTiles"));
	bytes[7] = 3;
	const view = new DataView(bytes.buffer);
	for (const [at, value] of [
		[8, 127],
		[16, root.length],
		[24, 127 + root.length],
		[32, 0],
		[40, leafOffset],
		[48, leafBytes],
		[56, tileOffset],
		[64, tile.length],
		[72, 1],
		[80, 1],
		[88, 1],
	])
		view.setBigUint64(at!, BigInt(value!), true);
	bytes.set([1, 2, 2, 1, 0, 1], 96);
	bytes.set(root, 127);
	if (leafBytes > 0) bytes.set(leaf, leafOffset + placement);
	bytes.set(tile, tileOffset);
	const landmarks = createPackedLandmarkIndexFixture({ archiveId: indexFixtureSha(bytes) });
	const release = BasemapSourceReleaseSchema.parse({
		schemaVersion: 1,
		pmtiles: {
			id: indexFixtureSha(bytes),
			objectKey: "source/planet.pmtiles",
			bytes: bytes.length,
			etag: "staging-etag",
			digest: { algorithm: "sha256", value: indexFixtureSha(bytes), verified: true },
			minZoom: 0,
			maxZoom: 1,
			coverage: "complete-planet",
		},
		references: {
			id: landmarks.reference.sha256,
			catalogueKey: landmarks.reference.key,
		},
	});
	const objects = new Map<string, Uint8Array>();
	objects.set(landmarks.reference.key, landmarks.bytes);
	const ranges: Array<{ offset: number; length: number }> = [];
	const repository = td.object<
		BasemapIndexPreparationRepository & { readObject(input: { key: string }): Promise<Uint8Array> }
	>();
	td.when(repository.readRange(td.matchers.anything())).thenDo(
		async (input: Parameters<typeof repository.readRange>[0]): ReturnType<typeof repository.readRange> => {
			ranges.push({ offset: input.offset, length: input.length });
			return bytes.slice(input.offset, input.offset + input.length);
		},
	);
	td.when(repository.readObject(td.matchers.anything())).thenDo(
		async (input: Parameters<typeof repository.readObject>[0]): ReturnType<typeof repository.readObject> => {
			const body = objects.get(input.key);
			if (body === undefined) throw new Error("Unexpected source object");
			return body;
		},
	);
	// Keep binary storage state in this fake; Testdouble clones every call argument.
	repository.putObject = async (
		input: Parameters<BasemapIndexPreparationRepository["putObject"]>[0],
	): ReturnType<BasemapIndexPreparationRepository["putObject"]> => {
		objects.set(input.key, input.bytes);
	};
	const reference = await new BasemapIndexPreparationService({ repository: repository }).prepare({
		release: release,
		landmarks: landmarks.reference,
	});
	const manifest = BasemapIndexManifestSchema.parse(
		JSON.parse(new TextDecoder().decode(objects.get(reference.manifestKey)!)),
	);
	return {
		raw: raw,
		tile: tile,
		bytes: bytes,
		release: release,
		objects: objects,
		ranges: ranges,
		repository: repository,
		reference: reference,
		manifest: manifest,
		landmarks: landmarks,
		tileOffset: tileOffset,
	};
}
