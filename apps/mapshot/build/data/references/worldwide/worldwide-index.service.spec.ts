import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSource, PMTiles, zxyToTileId, type Header } from "pmtiles";
import { afterEach, expect, it } from "vitest";
import {
	PackedLandmarkIndexMetadataSchema,
	type PackedLandmarkIndexMetadata,
} from "../../../../src/landmark/index/schemas/packed-landmark-index-metadata.schema";
import type { PackedLandmarkRow } from "../../../../src/landmark/index/schemas/packed-landmark-row.schema";
import { LandmarkIndexService } from "../../../../src/landmark/landmark-index.service";
import {
	WorldwideIndexService,
	type WorldwideIndexBuildInput,
	type WorldwideIndexBuildOutput,
} from "./worldwide-index.service";
import type { WorldwidePointSpoolRow } from "./schemas/worldwide-point-spool-row.schema";

const _directories: string[] = [];
afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function _point(
	params: {
		id?: string;
		x?: number;
		y?: number;
		u?: number;
		v?: number;
		offset?: number;
		weight?: number;
		ordinal?: number;
		name?: string;
	} = {},
): WorldwidePointSpoolRow {
	return [
		params.offset ?? 1000,
		params.weight ?? 1,
		zxyToTileId(15, params.x ?? 16384, params.y ?? 16384),
		params.ordinal ?? 0,
		params.id ?? "18446744073709551615",
		"school",
		params.name ?? "مدرسة 原名",
		{ "name:ja": "学校", "name:pt": "Escola\u2028da\u2029Praça" },
		null,
		12,
		3,
		params.u ?? 0.5,
		params.v ?? 0.5,
	];
}

function _fixture(params: { rows?: WorldwidePointSpoolRow[]; body?: Buffer } = {}): {
	directory: string;
	body: Buffer;
	input: WorldwideIndexBuildInput;
	service: WorldwideIndexService;
} {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-worldwide-index-test-"));
	_directories.push(directory);
	const rows = params.rows ?? [_point()];
	const body = params.body ?? Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
	const path = join(directory, "points.ndjson");
	writeFileSync(path, body);
	const spool = {
		files: [
			{ path: path, bytes: body.length, lines: rows.length, sha256: createHash("sha256").update(body).digest("hex") },
		],
	};
	const input: WorldwideIndexBuildInput = {
		spool: spool,
		aliasesPath: null,
		directory: directory,
	};
	return { directory: directory, body: body, input: input, service: new WorldwideIndexService() };
}

async function _archive(params: { path: string; x?: number; y?: number }): Promise<{
	metadata: PackedLandmarkIndexMetadata;
	header: Header;
	rows: PackedLandmarkRow[];
}> {
	const body = readFileSync(params.path);
	const archive = new PMTiles(new FileSource(new File([body], "landmarks.pmtiles")));
	const header = await archive.getHeader();
	const metadata = PackedLandmarkIndexMetadataSchema.parse(await archive.getMetadata());
	const tile = await archive.getZxy(13, params.x ?? 4096, params.y ?? 4096);
	const rows: PackedLandmarkRow[] = tile ? JSON.parse(new TextDecoder().decode(tile.data)) : [];
	return { metadata: metadata, header: header, rows: rows };
}

async function _openLandmarks(params: { output: WorldwideIndexBuildOutput }): Promise<LandmarkIndexService> {
	return LandmarkIndexService.open({
		path: params.output.path,
		reference: {
			key: "source/import/attempts/generator/compatibility/references/landmarks.pmtiles",
			sha256: params.output.sha256,
			bytes: params.output.bytes,
			archiveId: "a".repeat(64),
		},
	});
}

function _aliases(params: { directory: string; entries: { offset: number; tileId: number; run: number }[] }): string {
	const bytes = Buffer.alloc(params.entries.length * 16);
	params.entries.forEach((entry, index) => {
		bytes.writeBigUInt64LE(BigInt(entry.offset), index * 16);
		bytes.writeUInt32LE(entry.tileId, index * 16 + 8);
		bytes.writeUInt32LE(entry.run, index * 16 + 12);
	});
	const path = join(params.directory, "aliases.bin");
	writeFileSync(path, bytes);
	return path;
}

it("writes a worldwide z13 archive preserving uint64 IDs, multilingual names and Unicode line separators", async () => {
	const fixture = _fixture();
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(output.bytes).toBe(readFileSync(output.path).length);
	expect(output.sha256).toBe(createHash("sha256").update(readFileSync(output.path)).digest("hex"));
	expect(archive.metadata).toMatchObject({
		coverage: "worldwide-source-zoom-15",
		sourceZoom: 15,
		indexZoom: 13,
		records: 1,
		cells: 1,
	});
	expect(archive.header).toMatchObject({ minZoom: 13, maxZoom: 13, tileType: 0, numTileContents: 1 });
	expect(archive.header.tileDataOffset + archive.header.tileDataLength!).toBe(output.bytes);
	expect(archive.rows).toEqual([
		[
			"18446744073709551615",
			"مدرسة 原名",
			{ "name:ja": "学校", "name:pt": "Escola\u2028da\u2029Praça" },
			"school",
			null,
			expect.closeTo(0.0054931640625, 10),
			expect.closeTo(-0.00549316405408, 10),
			12,
			3,
		],
	]);
});

it("generates admitted source kinds for the production reader", async () => {
	const kinds = [
		"bus_station",
		"marketplace",
		"courthouse",
		"community_centre",
		"pedestrian",
		"ferry_terminal",
		"police",
		"fire_station",
		"clinic",
		"pharmacy",
		"public_building",
		"building",
		"bridge",
	] as const;
	const rows = kinds.map((kind, ordinal): WorldwidePointSpoolRow => {
		const point = _point({ id: String(ordinal + 1), ordinal: ordinal, name: `${kind} source name` });
		point[5] = kind;
		return point;
	});
	const fixture = _fixture({ rows: rows });
	const output = await fixture.service.build(fixture.input);
	const landmarks = await _openLandmarks({ output: output });
	try {
		const records = await landmarks.query({
			center: { latitude: 0, longitude: 0 },
			zoom: 13,
			size: { width: 512, height: 512 },
		});
		expect(new Set(records.map((record) => record.kind))).toEqual(new Set(kinds));
		for (const record of records) expect(record.label).toBe(`${record.kind} source name`);
	} finally {
		await landmarks.close();
	}
});

it("generates an archive the production landmark reader can open and query", async () => {
	const fixture = _fixture();
	const output = await fixture.service.build(fixture.input);
	const landmarks = await _openLandmarks({ output: output });
	try {
		expect(
			await landmarks.query({
				center: { latitude: 0, longitude: 0 },
				zoom: 13,
				size: { width: 512, height: 512 },
			}),
		).toEqual([
			{
				id: "pois:school:18446744073709551615",
				label: "مدرسة 原名",
				alternativeLabels: ["学校", "Escola\u2028da\u2029Praça"],
				coordinates: {
					latitude: expect.closeTo(-0.00549316405408, 10),
					longitude: expect.closeTo(0.0054931640625, 10),
				},
				kind: "school",
				kindDetail: null,
				minZoom: 12,
				rank: 3,
			},
		]);
		expect(
			await landmarks.query({
				center: { latitude: 30, longitude: 90 },
				zoom: 13,
				size: { width: 512, height: 512 },
			}),
		).toEqual([]);
	} finally {
		await landmarks.close();
	}
});

it("indexes useful points outside Brazil and keeps empty primary names when a real alternative exists", async () => {
	const row = _point({ x: 29100, y: 12900, name: "" });
	const fixture = _fixture({ rows: [row] });
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive({ path: output.path, x: Math.floor(29100 / 4), y: Math.floor(12900 / 4) });
	expect(archive.rows).toHaveLength(1);
	expect(archive.rows[0]).toMatchObject({ 0: "18446744073709551615", 1: "", 2: { "name:ja": "学校" } });
	expect(archive.rows[0]?.[5]).toBeGreaterThan(130);
});

it("deduplicates buffered tile copies and selects the source tile which owns the actual point", async () => {
	const buffered = _point({ x: 16383, u: 1.5, name: "Buffered copy", offset: 1000 });
	const nominal = _point({ x: 16384, u: 0.5, name: "Nominal owner", offset: 2000 });
	const fixture = _fixture({ rows: [buffered, nominal] });
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(archive.rows).toHaveLength(1);
	expect(archive.rows[0]?.[1]).toBe("Nominal owner");
});

it("wraps buffered points at the antimeridian into their worldwide output cell", async () => {
	const fixture = _fixture({ rows: [_point({ x: 32767, u: 1.5 })] });
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive({ path: output.path, x: 0 });
	expect(archive.rows).toHaveLength(1);
	expect(archive.rows[0]?.[5]).toBeCloseTo(-179.9945068359375, 10);
});

it("accepts landmarks at both supported Mercator latitude boundaries", async () => {
	const fixture = _fixture({
		rows: [_point({ id: "1", y: 0, v: 0 }), _point({ id: "2", y: 32767, v: 1 })],
	});
	const output = await fixture.service.build(fixture.input);
	const north = await _archive({ path: output.path, y: 0 });
	expect(north.header.numTileContents).toBe(2);
	expect(north.rows[0]?.[6]).toBeCloseTo(85.0511287798, 8);
	expect((await _archive({ path: output.path, y: 8191 })).rows[0]?.[6]).toBeCloseTo(-85.0511287798, 8);
});

it("produces deterministic canonical rows and archive bytes regardless of physical arrival order", async () => {
	const rows = [_point({ id: "9007199254740993", ordinal: 1 }), _point({ id: "9007199254740992", ordinal: 0 })];
	const first = _fixture({ rows: rows });
	const second = _fixture({ rows: [...rows].reverse() });
	const firstOutput = await first.service.build(first.input);
	const secondOutput = await second.service.build(second.input);
	expect(secondOutput.sha256).toBe(firstOutput.sha256);
	expect(readFileSync(secondOutput.path)).toEqual(readFileSync(firstOutput.path));
	expect((await _archive(firstOutput)).rows.map((row) => row[0])).toEqual(["9007199254740992", "9007199254740993"]);
});

it("breaks same-source ownership ties by original feature ordinal rather than worker arrival order", async () => {
	const rows = [_point({ ordinal: 4, name: "Later feature" }), _point({ ordinal: 1, name: "First feature" })];
	const first = _fixture({ rows: rows });
	const second = _fixture({ rows: [...rows].reverse() });
	const firstOutput = await first.service.build(first.input);
	const secondOutput = await second.service.build(second.input);
	expect(firstOutput.sha256).toBe(secondOutput.sha256);
	expect((await _archive(firstOutput)).rows[0]?.[1]).toBe("First feature");
});

it("rejects a provider ID repeated at geographically unrelated locations", async () => {
	const fixture = _fixture({ rows: [_point(), _point({ x: 1000, y: 1000, offset: 2000 })] });
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("rejects a shared point content whose aliases move the same provider ID to conflicting anchors", async () => {
	const fixture = _fixture({ rows: [_point({ weight: 2 })] });
	fixture.input.aliasesPath = _aliases({
		directory: fixture.directory,
		entries: [
			{ offset: 1000, tileId: zxyToTileId(15, 16384, 16384), run: 1 },
			{ offset: 1000, tileId: zxyToTileId(15, 16385, 16384), run: 1 },
		],
	});
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("ignores aliases for physical contents with no useful point rows", async () => {
	const fixture = _fixture();
	fixture.input.aliasesPath = _aliases({
		directory: fixture.directory,
		entries: [{ offset: 9999, tileId: zxyToTileId(15, 100, 100), run: 2 }],
	});
	const output = await fixture.service.build(fixture.input);
	expect((await _archive(output)).rows).toHaveLength(1);
});

it("rejects a truncated alias record rather than losing shared placements", async () => {
	const fixture = _fixture({ rows: [_point({ weight: 2 })] });
	fixture.input.aliasesPath = join(fixture.directory, "aliases.bin");
	writeFileSync(fixture.input.aliasesPath, Buffer.alloc(15));
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it.each([
	{
		name: "checksum",
		change: (input: ReturnType<typeof _fixture>["input"]) => {
			input.spool.files[0]!.sha256 = "0".repeat(64);
		},
	},
	{
		name: "byte receipt",
		change: (input: ReturnType<typeof _fixture>["input"]) => {
			input.spool.files[0]!.bytes += 1;
		},
	},
	{
		name: "line receipt",
		change: (input: ReturnType<typeof _fixture>["input"]) => {
			input.spool.files[0]!.lines += 1;
		},
	},
])("rejects a spool with a mismatched $name", async ({ change }) => {
	const fixture = _fixture();
	change(fixture.input);
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it.each([
	{ name: "missing final LF", body: () => Buffer.from(JSON.stringify(_point())) },
	{ name: "invalid JSON", body: () => Buffer.from("{broken}\n") },
	{
		name: "truncated UTF-8",
		body: () =>
			Buffer.concat([Buffer.from(JSON.stringify(_point()).slice(0, -1)), Buffer.from([0xe6, 0x97]), Buffer.from("\n")]),
	},
])("rejects $name instead of publishing a partial index", async ({ body }) => {
	const fixture = _fixture({ body: body() });
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("refuses an empty worldwide extraction", async () => {
	const fixture = _fixture({ rows: [], body: Buffer.alloc(0) });
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INCOMPLETE" });
});

it("stops an aborted index generation before opening its scratch database", async () => {
	const fixture = _fixture();
	const reason = new Error("workflow cancelled");
	await expect(fixture.service.build({ ...fixture.input, signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
	expect(() => readFileSync(join(fixture.directory, "staging.sqlite"))).toThrow();
});

it("observes workflow cancellation while packing a large catalogue before publishing its archive", async () => {
	const fixture = _fixture({
		rows: Array.from({ length: 4096 }, (_, index) =>
			_point({ id: String(index + 1), x: index * 4, y: 16000, offset: index + 1 }),
		),
	});
	const controller = new AbortController();
	const reason = new Error("workflow cancelled during packing");
	const watcher = watch(fixture.directory, (_event, filename) => {
		if (filename === "payload.bin") controller.abort(reason);
	});
	try {
		await expect(fixture.service.build({ ...fixture.input, signal: controller.signal })).rejects.toBe(reason);
	} finally {
		watcher.close();
	}
	expect(existsSync(join(fixture.directory, "landmarks.pmtiles.partial"))).toBe(false);
	expect(existsSync(join(fixture.directory, "landmarks.pmtiles"))).toBe(false);
});

it("refuses to overwrite a completed or interrupted index generation", async () => {
	const fixture = _fixture();
	writeFileSync(join(fixture.directory, "landmarks.pmtiles.partial"), "interrupted");
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "STAGING_CONFLICT" });
});

it("rejects an unterminated physical row larger than the former byte budget", async () => {
	const fixture = _fixture({ body: Buffer.alloc(16 * 1024 * 1024 + 1, 32) });
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("writes multiple PMTiles leaf directories the production landmark reader can query", async () => {
	const rows = Array.from({ length: 2100 }, (_, index) =>
		_point({ id: String(index + 1), x: index * 4, y: 16000, offset: 1000 + index }),
	);
	const fixture = _fixture({ rows: rows });
	const output = await fixture.service.build(fixture.input);
	expect((await _archive(output)).metadata).toMatchObject({ records: 2100, cells: 2100 });
	const cellsByTileId = rows
		.map((_row, index) => index)
		.toSorted((left, right) => zxyToTileId(13, left, 4000) - zxyToTileId(13, right, 4000));
	const landmarks = await _openLandmarks({ output: output });
	try {
		for (const index of [cellsByTileId[0]!, cellsByTileId[1999]!, cellsByTileId[2000]!, cellsByTileId[2099]!]) {
			const archive = await _archive({ path: output.path, x: index, y: 4000 });
			const point = archive.rows[0]!;
			expect(point[0]).toBe(String(index + 1));
			expect(
				await landmarks.query({
					center: { latitude: point[6], longitude: point[5] },
					zoom: 13,
					size: { width: 1, height: 1 },
				}),
			).toMatchObject([{ id: `pois:school:${index + 1}`, label: "مدرسة 原名" }]);
		}
	} finally {
		await landmarks.close();
	}
});

it("streams rows across filesystem chunks and commits bounded batches", async () => {
	const fixture = _fixture({
		rows: Array.from({ length: 16384 }, (_, index) => _point({ id: String(index + 1), ordinal: index })),
	});
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(archive.header.numTileContents).toBe(1);
	expect(archive.rows).toHaveLength(16384);
});

it("streams long alias tables while ignoring contents with no useful points", async () => {
	const fixture = _fixture();
	fixture.input.aliasesPath = _aliases({
		directory: fixture.directory,
		entries: Array.from({ length: 1024 }, (_, index) => ({
			offset: 9999 + index,
			tileId: zxyToTileId(15, 100, 100),
			run: 1,
		})),
	});
	const output = await fixture.service.build(fixture.input);
	expect((await _archive(output)).rows).toHaveLength(1);
});

it("rejects an invalid physical row when its LF arrives beyond the former byte budget", async () => {
	const fixture = _fixture({ body: Buffer.concat([Buffer.alloc(16 * 1024 * 1024, 32), Buffer.from(" \n")]) });
	await expect(fixture.service.build(fixture.input)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("preserves a valid physical row larger than the former 16 MiB budget", async () => {
	const name = "A".repeat(16 * 1024 * 1024);
	const fixture = _fixture({ rows: [_point({ name: name })] });
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(archive.rows).toHaveLength(1);
	expect(archive.rows[0]?.[1]).toBe(name);
});

it("preserves every record in an output cell larger than the former 16 MiB budget", async () => {
	const fixture = _fixture({
		rows: Array.from({ length: 258 }, (_, index) => _point({ id: String(index + 1), name: "A".repeat(65536) })),
	});
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(archive.header.numTileContents).toBe(1);
	expect(archive.rows).toHaveLength(258);
	expect(archive.rows.every((row) => row[1] === "A".repeat(65536))).toBe(true);
});

it("preserves every record in a dense output cell beyond the former 65,536 record budget", async () => {
	const fixture = _fixture({
		rows: Array.from({ length: 65_537 }, (_, index) => {
			const row = _point({ id: String(index + 1), name: "A" });
			row[7] = {};
			return row;
		}),
	});
	const output = await fixture.service.build(fixture.input);
	const archive = await _archive(output);
	expect(archive.header.numTileContents).toBe(1);
	expect(archive.rows).toHaveLength(65_537);
	expect(new Set(archive.rows.map((row) => row[0])).size).toBe(65_537);
}, 15000);
