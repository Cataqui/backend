import { describe, expect, it } from "vitest";
import { BasemapResourceRevisionSchema } from "./basemap-resource-revision.schema";
import { BasemapSourceReleaseSchema } from "../sources/schemas/basemap-source-release.schema";
import { PmtilesArchiveRevisionSchema } from "../sources/schemas/pmtiles-archive-revision.schema";
import { PmtilesTileInputSchema } from "../pmtiles/schemas/pmtiles-tile-input.schema";
import { parseStoredBasemapResourcePath, StoredBasemapResourcePathSchema } from "./stored-basemap-resource-path.schema";

const _id = "a".repeat(64);
const _archive = PmtilesArchiveRevisionSchema.parse({
	id: _id,
	objectKey: "source/protomaps/planet.pmtiles",
	bytes: 138_796_124_160,
	etag: "opaque-multipart-etag",
	digest: { algorithm: "blake3", value: _id, verified: true },
	minZoom: 0,
	maxZoom: 15,
	coverage: "complete-planet",
});
const _release = BasemapSourceReleaseSchema.parse({
	schemaVersion: 1,
	pmtiles: _archive,
	references: {
		id: "d".repeat(64),
		catalogueKey: "source/references/generation/catalogue.json",
	},
});
const _resource = BasemapResourceRevisionSchema.parse({
	id: "e".repeat(64),
	path: `/tiles/${_id}/0/0/0.mvt`,
});

describe("immutable source identities", () => {
	it("accepts archive and tile zooms through the PMTiles JavaScript precision boundary", () => {
		expect(PmtilesArchiveRevisionSchema.parse({ ..._archive, maxZoom: 26 }).maxZoom).toBe(26);
		expect(PmtilesTileInputSchema.parse({ z: 26, x: 2 ** 26 - 1, y: 2 ** 26 - 1 })).toEqual({
			z: 26,
			x: 2 ** 26 - 1,
			y: 2 ** 26 - 1,
		});
	});

	it("rejects a published source without its landmark file address", () => {
		const references = { id: _release.references.id };
		expect(BasemapSourceReleaseSchema.safeParse({ ..._release, references: references }).success).toBe(false);
	});
	it("accepts verified archives and their published landmark references", () => {
		expect(PmtilesArchiveRevisionSchema.parse(_archive)).toEqual(_archive);
		expect(BasemapSourceReleaseSchema.parse(_release)).toEqual(_release);
		expect(
			PmtilesArchiveRevisionSchema.parse({
				..._archive,
				digest: { algorithm: "sha256", value: _id, verified: true },
				coverage: "finite-fixture",
			}).coverage,
		).toBe("finite-fixture");
	});
	it.each([
		{ id: "display-name" },
		{ id: "b".repeat(64) },
		{ etag: '"quoted"' },
		{ etag: "value\r\nPrivate: value" },
		{ bytes: 126 },
		{ bytes: 127.5 },
		{ bytes: Number.MAX_SAFE_INTEGER + 1 },
		{ minZoom: 16 },
		{ minZoom: 15, maxZoom: 14 },
		{ maxZoom: 27 },
		{ digest: { algorithm: "blake3", value: _id, verified: false } },
		{ digest: { algorithm: "md5", value: _id, verified: true } },
		{ digest: { algorithm: "sha256", value: "A".repeat(64), verified: true } },
		{ unknown: true },
	])("rejects invalid or unverified archive metadata %o", (change) => {
		expect(PmtilesArchiveRevisionSchema.safeParse({ ..._archive, ...change }).success).toBe(false);
	});
	it.each([
		{ schemaVersion: 2 },
		{ pmtiles: { ..._archive, coverage: "complete-country" } },
		{ pmtiles: { ..._archive, coverage: "finite-fixture" } },
		{ glyphs: { id: "c".repeat(64), manifestKey: "source/glyphs/manifest.json" } },
		{ references: { ..._release.references, catalogueKey: "https://provider.test/catalogue.json" } },
		{ references: { ..._release.references, catalogueKey: "source/key?credential=value" } },
		{ extra: true },
	])("rejects unsupported or unsafe published source metadata %o", (change) => {
		expect(BasemapSourceReleaseSchema.safeParse({ ..._release, ...change }).success).toBe(false);
	});
	it("rejects invalid resource metadata", () => {
		expect(BasemapResourceRevisionSchema.safeParse({ ..._resource, id: "display-name" }).success).toBe(false);
	});
});

describe("canonical stored resource paths", () => {
	it("accepts bounded tile coordinates and reports the invalid axis", () => {
		expect(PmtilesTileInputSchema.parse({ z: 15, x: 32767, y: 32767 })).toEqual({ z: 15, x: 32767, y: 32767 });
		const invalid = PmtilesTileInputSchema.safeParse({ z: 1, x: 2, y: 2 });
		expect(invalid.success).toBe(false);
		if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.path)).toEqual([["x"], ["y"]]);
		expect(PmtilesTileInputSchema.safeParse({ z: 0, x: 0, y: -1 }).success).toBe(false);
	});
	it("resolves tile paths into their owned resource locations", () => {
		const tile = `/tiles/${_id}/15/32767/0.mvt`;
		expect(StoredBasemapResourcePathSchema.parse(tile)).toBe(tile);
		expect(parseStoredBasemapResourcePath({ path: tile })).toEqual({ kind: "tile", id: _id, z: 15, x: 32767, y: 0 });
	});
	it.each([
		`/tiles/${_id}/01/0/0.mvt`,
		`/tiles/${_id}/1/00/0.mvt`,
		`/tiles/${_id}/1/0/00.mvt`,
		`/tiles/${_id}/1/2/0.mvt`,
		`/tiles/${_id}/27/0/0.mvt`,
		`/tiles/${_id}/1/0/0.mvt?key=secret`,
		`/glyphs/${_id}/Noto Sans/0-255.pbf`,
		`/glyphs/${_id}/Noto%2fsans/0-255.pbf`,
		`/glyphs/${_id}/%FF/0-255.pbf`,
		`/glyphs/${_id}/%/0-255.pbf`,
		`/glyphs/${_id}/%20Font/0-255.pbf`,
		`/glyphs/${_id}/%00/0-255.pbf`,
		`/glyphs/${_id}/Noto/00-255.pbf`,
		`/glyphs/${_id}/Noto/0-0255.pbf`,
		`/glyphs/${_id}/Noto/1-256.pbf`,
		`/glyphs/${_id}/Noto/0-256.pbf`,
		`/glyphs/${_id}/Noto/1114112-1114367.pbf`,
		`/glyphs/${_id}/Noto/9007199254740992-9007199254741247.pbf`,
		`/glyphs/${_id}/${"a".repeat(257)}/0-255.pbf`,
		"/unknown",
	])("rejects aliased or unsafe resource path %s", (path) => {
		expect(StoredBasemapResourcePathSchema.safeParse(path).success).toBe(false);
		expect(parseStoredBasemapResourcePath({ path: path })).toBeNull();
	});
});
