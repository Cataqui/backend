import { StoredBasemapResourcePathSchema, parseStoredBasemapResourcePath } from "./stored-basemap-resource-path.schema";
const _id = "a".repeat(64);
describe("canonical stored resource paths", () => {
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
		`/glyphs/${_id}/Inter%20SemiBold/0-255.pbf`,
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
