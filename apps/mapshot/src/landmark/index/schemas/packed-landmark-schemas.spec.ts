import { describe, expect, it } from "vitest";
import { PackedLandmarkColumns, PackedLandmarkKinds } from "../packed-landmark-format";
import { PackedLandmarkIndexMetadataSchema } from "./packed-landmark-index-metadata.schema";
import { PackedLandmarkIndexReferenceSchema } from "./packed-landmark-index-reference.schema";
import { type PackedLandmarkRow, PackedLandmarkRowSchema } from "./packed-landmark-row.schema";

const _archiveId = "a".repeat(64);
const _row: PackedLandmarkRow = [
	"18446744073709551615",
	"図書館",
	{ "name:en": "Library", name2: "Biblioteca" },
	"library",
	null,
	139.75,
	35.68,
	13,
	null,
];
const _metadata = {
	schemaVersion: 1,
	format: "mapshot-landmark-points-v1",
	coverage: "worldwide-source-zoom-15",
	sourceZoom: 15,
	indexZoom: 13,
	columns: PackedLandmarkColumns,
	records: 5_261_013,
	cells: 845_344,
};
const _reference = {
	key: `source/import/attempts/weekly-20261015/${_archiveId}/references/landmarks.pmtiles`,
	sha256: "c".repeat(64),
	bytes: 315_561_636,
	archiveId: _archiveId,
};

describe("worldwide packed landmark rows", () => {
	it("derives extraction kinds from the selected place categories", () => {
		expect(PackedLandmarkKinds).toEqual([
			"aerodrome",
			"station",
			"mall",
			"stadium",
			"hospital",
			"university",
			"college",
			"school",
			"museum",
			"zoo",
			"place_of_worship",
			"park",
			"national_park",
			"garden",
			"nature_reserve",
			"recreation_ground",
			"village_green",
			"supermarket",
			"grocery",
			"library",
			"townhall",
			"government",
			"courthouse",
			"theatre",
			"attraction",
			"monument",
			"artwork",
			"bus_station",
			"marketplace",
			"police",
			"fire_station",
			"pharmacy",
			"community_centre",
			"pedestrian",
			"ferry_terminal",
			"clinic",
			"public_building",
			"building",
			"bridge",
		]);
	});
	it.each(["fuel", "post_office"])("rejects excluded %s records from the landmark archive", (kind) => {
		const row = [..._row];
		row[3] = kind;
		expect(PackedLandmarkRowSchema.safeParse(row).success).toBe(false);
	});
	it.each(["0", "9007199254740993", "18446744073709551615"])(
		"preserves the exact provider uint64 ID %s without number coercion",
		(id) => {
			expect(PackedLandmarkRowSchema.parse([id, ..._row.slice(1)])[0]).toBe(id);
		},
	);
	it.each([Number("18446744073709551615"), "18446744073709551616", "-1", "01", "1.5", "provider:1", ""])(
		"rejects invalid or lossy provider ID %s without throwing",
		(id) => {
			expect(PackedLandmarkRowSchema.safeParse([id, ..._row.slice(1)]).success).toBe(false);
		},
	);
	it("preserves the provider primary name and all provider alternatives", () => {
		expect(PackedLandmarkRowSchema.parse(_row)).toEqual(_row);
	});
	it("retains provider names and details beyond the former field length budgets", () => {
		const row = [..._row];
		row[1] = "界".repeat(65537);
		row[2] = { [`name:${"x".repeat(257)}`]: "م".repeat(65537) };
		row[4] = "x".repeat(65537);
		row[7] = 25;
		expect(PackedLandmarkRowSchema.parse(row)).toEqual(row);
	});
	it.each(["name2", "name3", "name:ja", "name:pt"])(
		"accepts an empty primary name when %s contains a real provider alternative",
		(key) => {
			const row = [..._row];
			row[1] = "";
			row[2] = { [key]: "図書館" };
			expect(PackedLandmarkRowSchema.parse(row)).toEqual(row);
		},
	);
	it.each([{}, { name2: " \n " }, { fallback: "Library" }, { label: "Library" }])(
		"rejects missing provider names instead of accepting a synthesized fallback %o",
		(names) => {
			const row = [..._row];
			row[1] = " \t ";
			row[2] = names;
			expect(PackedLandmarkRowSchema.safeParse(row).success).toBe(false);
		},
	);
	it("requires exactly the nine ordered columns", () => {
		expect(PackedLandmarkRowSchema.safeParse(_row.slice(0, 8)).success).toBe(false);
		expect(PackedLandmarkRowSchema.safeParse([..._row, "extra"]).success).toBe(false);
	});
	it("rejects landmark kinds outside the useful-point policy", () => {
		const row = [..._row];
		row[3] = "restaurant";
		expect(PackedLandmarkRowSchema.safeParse(row).success).toBe(false);
	});
	it.each([
		{ longitude: -180, latitude: -85.05112878 },
		{ longitude: 179.999999, latitude: 85.05112878 },
		{ longitude: 18.42, latitude: -33.92 },
	])("accepts worldwide coordinates within Mercator bounds %o", ({ longitude, latitude }) => {
		const row = [..._row];
		row[5] = longitude;
		row[6] = latitude;
		expect(PackedLandmarkRowSchema.safeParse(row).success).toBe(true);
	});
	it.each([
		{ longitude: -180.000001, latitude: 0 },
		{ longitude: 180, latitude: 0 },
		{ longitude: 0, latitude: -85.05112879 },
		{ longitude: 0, latitude: 85.05112879 },
		{ longitude: Number.NaN, latitude: 0 },
		{ longitude: 0, latitude: Number.POSITIVE_INFINITY },
	])("rejects coordinates outside unique geographic ownership %o", ({ longitude, latitude }) => {
		const row = [..._row];
		row[5] = longitude;
		row[6] = latitude;
		expect(PackedLandmarkRowSchema.safeParse(row).success).toBe(false);
	});
});

describe("verified worldwide packed landmark metadata", () => {
	it("accepts the exact global extraction format and column order", () => {
		expect(PackedLandmarkIndexMetadataSchema.parse(_metadata)).toEqual(_metadata);
	});
	it.each([
		{ schemaVersion: 2 },
		{ format: "mapshot-landmark-points-v2" },
		{ coverage: "brazil" },
		{ sourceZoom: 14 },
		{ indexZoom: 12 },
		{ columns: ["name", "id", ...PackedLandmarkColumns.slice(2)] },
		{ columns: PackedLandmarkColumns.slice(0, 8) },
		{ columns: [...PackedLandmarkColumns, "sourceTile"] },
		{ extra: true },
	])("rejects unsupported, ambiguous or incomplete metadata %o", (change) => {
		expect(PackedLandmarkIndexMetadataSchema.safeParse({ ..._metadata, ...change }).success).toBe(false);
	});
	it.each([
		{ records: 0, cells: 0 },
		{ records: 1, cells: 1 },
		{ records: Number.MAX_SAFE_INTEGER, cells: 2 ** 26 },
	])("accepts mutually consistent record and occupied-cell counts %o", (counts) => {
		expect(PackedLandmarkIndexMetadataSchema.safeParse({ ..._metadata, ...counts }).success).toBe(true);
	});
	it.each([
		{ records: 0, cells: 1 },
		{ records: 1, cells: 0 },
		{ records: 1, cells: 2 },
		{ records: -1, cells: 0 },
		{ records: 1.5, cells: 1 },
		{ records: 2, cells: 1.5 },
		{ records: Number.MAX_SAFE_INTEGER + 1, cells: 1 },
		{ records: 2 ** 26 + 1, cells: 2 ** 26 + 1 },
	])("rejects impossible or inexact record and cell counts %o", (counts) => {
		expect(PackedLandmarkIndexMetadataSchema.safeParse({ ..._metadata, ...counts }).success).toBe(false);
	});
});

describe("immutable packed landmark archive references", () => {
	it("binds an archive to the planet identity and its preparation attempt", () => {
		expect(PackedLandmarkIndexReferenceSchema.parse(_reference)).toEqual(_reference);
	});
	it("accepts landmark archive references larger than one GiB", () => {
		const reference = { ..._reference, bytes: 1024 * 1024 * 1024 + 1 };
		expect(PackedLandmarkIndexReferenceSchema.parse(reference)).toEqual(reference);
	});
	it.each([
		"source/planet.pmtiles",
		"source/import/attempts/weekly/../../references/landmarks.pmtiles",
		"source/import/attempts/weekly/source/references/other.pmtiles",
		"https://storage.test/landmarks.pmtiles",
	])("rejects archive keys outside the owned attempt namespace: %s", (key) => {
		expect(PackedLandmarkIndexReferenceSchema.safeParse({ ..._reference, key: key }).success).toBe(false);
	});
	it.each([
		{ archiveId: "A".repeat(64) },
		{ sha256: "C".repeat(64) },
		{ bytes: 126 },
		{ bytes: 127.5 },
		{ bytes: Number.MAX_SAFE_INTEGER + 1 },
		{ extra: true },
	])("rejects an invalid or unverifiable archive reference %o", (change) => {
		expect(PackedLandmarkIndexReferenceSchema.safeParse({ ..._reference, ...change }).success).toBe(false);
	});
});
