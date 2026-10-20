import { describe, expect, it } from "vitest";
import { BasemapIndexFileSchema } from "./schemas/basemap-index-file.schema";
import { BasemapIndexManifestSchema } from "./schemas/basemap-index-manifest.schema";
import { BasemapPreparedIndexReferenceSchema } from "./schemas/basemap-prepared-index-reference.schema";

const _archiveId = "a".repeat(64);
const _header = { path: `files/${"b".repeat(64)}.body`, sha256: "b".repeat(64), bytes: 127 };
const _leaf = { path: `files/${"c".repeat(64)}.body`, sha256: "c".repeat(64), bytes: 10 };
const _body = { path: `files/${"e".repeat(64)}.body`, sha256: "e".repeat(64), bytes: 16 };
const _manifest = BasemapIndexManifestSchema.parse({
	version: 1,
	archive: {
		id: _archiveId,
		bytes: 1000,
		digest: { algorithm: "sha256", value: _archiveId, verified: true },
		minZoom: 0,
		maxZoom: 15,
	},
	metadata: { headerRoot: _header, leaves: [{ file: _leaf, originalOffset: 127 }] },
	landmarks: {
		key: `source/import/attempts/${_archiveId}/0/references/landmarks.pmtiles`,
		sha256: "e".repeat(64),
		bytes: 127,
		archiveId: _archiveId,
	},
});
const _reference = BasemapPreparedIndexReferenceSchema.parse({
	manifestKey: `source/indexes/v1/${_archiveId}/${"f".repeat(64)}/manifest.json`,
	sha256: "f".repeat(64),
	bytes: 128,
	archiveId: _archiveId,
});

describe("immutable installed index files", () => {
	it("accepts bounded file sizes addressed by their exact content hash", () => {
		expect(BasemapIndexFileSchema.parse(_header)).toEqual(_header);
		expect(BasemapIndexFileSchema.parse({ ..._header, bytes: 8 * 1024 * 1024 + 1 }).bytes).toBe(8 * 1024 * 1024 + 1);
	});
	it.each([
		{ path: `files/${"f".repeat(64)}.body` },
		{ path: "files/../secret.body" },
		{ sha256: "B".repeat(64) },
		{ bytes: 0 },
		{ bytes: 1.5 },
		{ bytes: Number.MAX_SAFE_INTEGER + 1 },
		{ extra: true },
	])("rejects invalid file identity or length %o", (change) => {
		expect(BasemapIndexFileSchema.safeParse({ ..._header, ...change }).success).toBe(false);
	});
});

describe("immutable index manifests", () => {
	it("accepts manifests containing more than 8192 contiguous leaf chunks", () => {
		const leaves = Array.from({ length: 8193 }, (_, index) => ({
			file: _leaf,
			originalOffset: 127 + index * _leaf.bytes,
		}));
		const manifest = {
			..._manifest,
			archive: { ..._manifest.archive, bytes: 127 + leaves.length * _leaf.bytes },
			metadata: { headerRoot: _header, leaves: leaves },
		};
		expect(BasemapIndexManifestSchema.parse(manifest).metadata.leaves).toHaveLength(leaves.length);
	});

	it("rejects unexpected manifest fields", () => {
		expect(BasemapIndexManifestSchema.safeParse({ ..._manifest, extra: true }).success).toBe(false);
	});
	it("accepts contiguous leaves and root-only archives", () => {
		expect(BasemapIndexManifestSchema.parse(_manifest)).toEqual(_manifest);
		const metadata = {
			headerRoot: _header,
			leaves: [
				{ file: _leaf, originalOffset: 127 },
				{ file: _body, originalOffset: 137 },
			],
		};
		expect(BasemapIndexManifestSchema.parse({ ..._manifest, metadata: metadata }).metadata).toEqual(metadata);
		expect(
			BasemapIndexManifestSchema.parse({ ..._manifest, metadata: { headerRoot: _header, leaves: [] } }).metadata.leaves,
		).toEqual([]);
	});
	it.each([
		{ id: "f".repeat(64) },
		{ minZoom: 15, maxZoom: 14 },
		{ digest: { algorithm: "sha256", value: _archiveId, verified: false } },
		{ objectKey: "source/archive.pmtiles" },
	])("rejects mismatched archive content or publication-specific fields %o", (change) => {
		expect(
			BasemapIndexManifestSchema.safeParse({ ..._manifest, archive: { ..._manifest.archive, ...change } }).success,
		).toBe(false);
	});
	it.each([126, 16385])("rejects a header and root section of %s bytes", (bytes) => {
		expect(
			BasemapIndexManifestSchema.safeParse({
				..._manifest,
				metadata: { headerRoot: { ..._header, bytes: bytes }, leaves: [] },
			}).success,
		).toBe(false);
	});

	it.each([
		{ leaves: [{ file: _leaf, originalOffset: 126 }] },
		{
			leaves: [
				{ file: _leaf, originalOffset: 127 },
				{ file: _body, originalOffset: 138 },
			],
		},
		{ leaves: [{ file: _leaf, originalOffset: Number.MAX_SAFE_INTEGER }] },
		{ leaves: [{ file: _leaf, originalOffset: 991 }] },
	])("rejects noncontiguous or out-of-bounds leaf chunks %o", ({ leaves }) => {
		expect(
			BasemapIndexManifestSchema.safeParse({ ..._manifest, metadata: { headerRoot: _header, leaves: leaves } }).success,
		).toBe(false);
	});
});

describe("verified index build references", () => {
	it("pins the archive identity in the prepared manifest path", () => {
		expect(BasemapPreparedIndexReferenceSchema.parse(_reference)).toEqual(_reference);
		expect(BasemapPreparedIndexReferenceSchema.parse({ ..._reference, bytes: 8 * 1024 * 1024 + 1 }).bytes).toBe(
			8 * 1024 * 1024 + 1,
		);
		expect(BasemapPreparedIndexReferenceSchema.safeParse({ ..._reference, archiveId: "b".repeat(64) }).success).toBe(
			false,
		);
	});
	it.each([
		{ manifestKey: "source/indexes/v1/../manifest.json" },
		{ sha256: "invalid" },
		{ bytes: 0 },
		{ bytes: Number.MAX_SAFE_INTEGER + 1 },
		{ extra: true },
	])("rejects invalid prepared manifest references %o", (change) => {
		expect(BasemapPreparedIndexReferenceSchema.safeParse({ ..._reference, ...change }).success).toBe(false);
	});
});
