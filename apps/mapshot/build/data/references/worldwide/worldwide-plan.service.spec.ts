import * as td from "testdouble";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Compression, type Entry } from "pmtiles";
import { afterEach, expect, it } from "vitest";
import { WorldwidePlanService } from "./worldwide-plan.service";

type _Archive = Parameters<WorldwidePlanService["prepare"]>[0]["archive"];

afterEach(() => td.reset());

const _directories: string[] = [];
const _start = (4 ** 15 - 1) / 3;
afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function _varint(value: number): number[] {
	const bytes: number[] = [];
	let rest = BigInt(value);
	while (rest >= 128n) {
		bytes.push(Number(rest & 127n) | 128);
		rest >>= 7n;
	}
	bytes.push(Number(rest));
	return bytes;
}
function _directory(rows: Entry[]): Uint8Array {
	const output = [..._varint(rows.length)];
	let previous = 0;
	for (const row of rows) {
		output.push(..._varint(row.tileId - previous));
		previous = row.tileId;
	}
	for (const row of rows) output.push(..._varint(row.runLength));
	for (const row of rows) output.push(..._varint(row.length));
	for (const row of rows) output.push(..._varint(row.offset + 1));
	return Uint8Array.from(output);
}
function _fixture(
	params: {
		rows?: Entry[];
		gzip?: boolean;
		leaves?: Entry[][];
		rootBytes?: Uint8Array;
		leafCommentBytes?: number;
		leafOrder?: number[];
	} = {},
): {
	directory: string;
	archive: _Archive;
	header: Buffer;
	metadata: Buffer;
	reads: Parameters<_Archive["read"]>[0][];
	dataOffset: number;
	service: WorldwidePlanService;
} {
	const directory = mkdtempSync(join(tmpdir(), "mapshot-world-plan-"));
	_directories.push(directory);
	const rows = params.rows ?? [{ tileId: _start, offset: 0, length: 20, runLength: 4 ** 15 }];
	const encodedLeaves =
		params.leaves?.map((leaf) => {
			if (!params.gzip) return _directory(leaf);
			const compressed = gzipSync(_directory(leaf));
			if (params.leafCommentBytes === undefined) return compressed;
			const header = Buffer.from(compressed.subarray(0, 10));
			header[3] = (header[3] ?? 0) | 0x10;
			return Buffer.concat([
				header,
				Buffer.alloc(params.leafCommentBytes, 0x78),
				Buffer.from([0]),
				compressed.subarray(10),
			]);
		}) ?? [];
	const order = params.leafOrder ?? encodedLeaves.map((_leaf, index) => index);
	const offsets: number[] = [];
	let leafEnd = 0;
	for (const index of order) {
		offsets[index] = leafEnd;
		leafEnd += encodedLeaves[index]?.byteLength ?? 0;
	}
	const rootRows =
		encodedLeaves.length === 0
			? rows
			: encodedLeaves.map((leaf, index) => {
					const tileId = params.leaves?.[index]?.[0]?.tileId ?? 0;
					const row = { tileId: tileId, offset: offsets[index] ?? 0, length: leaf.length, runLength: 0 };
					return row;
				});
	const rawRoot = params.rootBytes ?? _directory(rootRows);
	const root = params.gzip ? gzipSync(rawRoot) : rawRoot;
	const header = Buffer.alloc(127);
	header.write("PMTiles");
	header[7] = 3;
	const actualRows = params.leaves?.flat() ?? rows;
	const dataLength = actualRows.reduce((maximum, row) => Math.max(maximum, row.offset + row.length), 0);
	const contents = new Set(actualRows.map((row) => row.offset)).size;
	const leaves = Buffer.concat(order.map((index) => encodedLeaves[index] ?? new Uint8Array()));
	const dataOffset = 127 + root.length + leaves.length;
	for (const [offset, value] of [
		[8, 127],
		[16, root.length],
		[24, 127 + root.length],
		[32, 0],
		[40, 127 + root.length],
		[48, leaves.length],
		[56, dataOffset],
		[64, dataLength],
		[72, actualRows.reduce((sum, row) => sum + row.runLength, 0)],
		[80, actualRows.length],
		[88, contents],
	])
		header.writeBigUInt64LE(BigInt(value ?? 0), offset);
	header[96] = 1;
	header[97] = params.gzip ? Compression.Gzip : Compression.None;
	header[98] = Compression.Gzip;
	header[99] = 1;
	header[100] = 0;
	header[101] = 15;
	const reads: { offset: number; length: number }[] = [];
	const metadata = Buffer.concat([header, root, leaves]);
	const archive = td.object<_Archive>();
	archive.bytes = dataOffset + dataLength;
	td.when(archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			reads.push(range);
			return metadata.subarray(range.offset, range.offset + range.length);
		},
	);
	return {
		directory: directory,
		archive: archive,
		header: header,
		metadata: metadata,
		reads: reads,
		dataOffset: dataOffset,
		service: new WorldwidePlanService(),
	};
}
async function _prepare(
	fixture: ReturnType<typeof _fixture>,
	signal?: AbortSignal,
): ReturnType<WorldwidePlanService["prepare"]> {
	return fixture.service.prepare({
		archive: fixture.archive,
		directory: fixture.directory,
		...(signal === undefined ? {} : { signal: signal }),
	});
}
it("plans the complete billion-address world with one compressed empty run and bounded metadata reads", async () => {
	const fixture = _fixture();
	const plan = await _prepare(fixture);
	expect(fixture.reads.reduce((sum, range) => sum + range.length, 0)).toBe(fixture.metadata.length);
	const member = readFileSync(plan.membersPath);
	expect(member.length).toBe(24);
	expect(member.readBigUInt64LE(0)).toBe(BigInt(fixture.dataOffset));
	expect([...new Uint32Array(member.buffer, member.byteOffset + 8, 4)]).toEqual([20, _start, 4 ** 15, 0]);
	const alias = readFileSync(plan.aliasesPath);
	expect(alias.length).toBe(16);
	expect(alias.readUInt32LE(8)).toBe(_start);
	expect(alias.readUInt32LE(12)).toBe(4 ** 15);
	expect(fixture.reads).toHaveLength(2);
	expect(readdirSync(fixture.directory).sort()).toEqual(["aliases.bin", "members.bin"]);
});
it("deduplicates physical contents, preserving every logical alias and sorting physical offsets", async () => {
	const fixture = _fixture({
		rows: [
			{ tileId: _start - 1, offset: 0, length: 9, runLength: 1 },
			{ tileId: _start, offset: 9, length: 11, runLength: 1 },
			{ tileId: _start + 1, offset: 0, length: 9, runLength: 1 },
			{ tileId: _start + 2, offset: 9, length: 11, runLength: 2 },
			{ tileId: _start + 4, offset: 0, length: 9, runLength: 4 ** 15 - 4 },
		],
	});
	const plan = await _prepare(fixture);
	const members = readFileSync(plan.membersPath);
	expect(members).toHaveLength(2 * 24);
	expect(members.readBigUInt64LE(0)).toBe(BigInt(fixture.dataOffset));
	expect(members.readUInt32LE(12)).toBe(_start + 1);
	expect(members.readUInt32LE(16)).toBe(4 ** 15 - 3);
	expect(members.readBigUInt64LE(24)).toBe(BigInt(fixture.dataOffset + 9));
	expect(members.readUInt32LE(40)).toBe(3);
	const aliases = readFileSync(plan.aliasesPath);
	expect(aliases.length).toBe(64);
	expect(
		[0, 16, 32, 48].map((offset) => [aliases.readUInt32LE(offset + 8), aliases.readUInt32LE(offset + 12)]),
	).toEqual([
		[_start + 1, 1],
		[_start + 4, 4 ** 15 - 4],
		[_start, 1],
		[_start + 2, 2],
	]);
});
it("omits singleton aliases and clips a source run spanning lower and higher zooms", async () => {
	const fixture = _fixture({
		rows: [
			{ tileId: 0, offset: 0, length: 10, runLength: _start + 1 },
			{ tileId: _start + 1, offset: 10, length: 20, runLength: 4 ** 15 },
		],
	});
	fixture.metadata[101] = 16;
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath).readUInt32LE(16)).toBe(1);
	expect(readFileSync(plan.aliasesPath).length).toBe(16);
});
it("walks gzip-compressed root and leaves without reading planet payloads", async () => {
	const fixture = _fixture({
		gzip: true,
		leaves: [
			[{ tileId: _start, offset: 0, length: 10, runLength: 1 }],
			[{ tileId: _start + 1, offset: 10, length: 20, runLength: 4 ** 15 - 1 }],
		],
	});
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(2 * 24);
	expect(fixture.reads.reduce((sum, range) => sum + range.length, 0)).toBe(fixture.metadata.length);
	expect(fixture.reads).toHaveLength(3);
});
it.each([
	["a missing world interval", [{ tileId: _start + 1, offset: 0, length: 10, runLength: 4 ** 15 - 1 }], "INCOMPLETE"],
	["an incomplete world tail", [{ tileId: _start, offset: 0, length: 10, runLength: 1 }], "INCOMPLETE"],
	[
		"overlapping logical addresses",
		[
			{ tileId: _start, offset: 0, length: 10, runLength: 2 },
			{ tileId: _start + 1, offset: 10, length: 10, runLength: 4 ** 15 - 1 },
		],
		"INVALID_ARCHIVE",
	],
	[
		"conflicting physical lengths",
		[
			{ tileId: _start, offset: 0, length: 10, runLength: 1 },
			{ tileId: _start + 1, offset: 0, length: 9, runLength: 4 ** 15 - 1 },
		],
		"INVALID_ARCHIVE",
	],
	[
		"overlapping physical contents",
		[
			{ tileId: _start, offset: 0, length: 10, runLength: 1 },
			{ tileId: _start + 1, offset: 9, length: 10, runLength: 4 ** 15 - 1 },
		],
		"INVALID_ARCHIVE",
	],
	["unreferenced physical gaps", [{ tileId: _start, offset: 1, length: 10, runLength: 4 ** 15 }], "INVALID_ARCHIVE"],
] as const)("rejects %s and removes partial plan files", async (_name, rows, error) => {
	const fixture = _fixture({ rows: [...rows] });
	await expect(_prepare(fixture)).rejects.toThrow(error);
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it.each([
	["wrong signature", 0, 0],
	["unsupported PMTiles version", 7, 4],
	["unclustered source", 96, 0],
	["unsupported directory compression", 97, 3],
	["uncompressed tiles", 98, 1],
	["non-MVT tiles", 99, 2],
	["insufficient source detail", 101, 14],
	["source beginning beyond zoom15", 100, 16],
] as const)("rejects %s", async (_name, offset, value) => {
	const fixture = _fixture();
	fixture.metadata[offset] = value;
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it.each([72, 80, 88, 64])("rejects inconsistent authoritative header counter %s", async (offset) => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(fixture.metadata.readBigUInt64LE(offset) + 1n, offset);
	if (offset === 64) fixture.archive.bytes++;
	await expect(_prepare(fixture)).rejects.toThrow("INTEGRITY");
});
it.each([
	["truncated varint", [128]],
	["unsafe varint", [255, 255, 255, 255, 255, 255, 255, 16]],
	["unterminated varint", [255, 255, 255, 255, 255, 255, 255, 128]],
	["empty directory", [0]],
	["entry count without required columns", [..._varint(131073)]],
	["duplicate tile IDs", [2, ..._varint(_start), 0, 1, 1, 10, 10, 1, 11]],
	["zero tile length", [1, ..._varint(_start), ..._varint(4 ** 15), 0, 1]],
	["implicit first offset", [1, ..._varint(_start), ..._varint(4 ** 15), 10, 0]],
	["trailing directory bytes", [..._directory([{ tileId: _start, offset: 0, length: 10, runLength: 4 ** 15 }]), 0]],
] as const)("rejects %s", async (_name, bytes) => {
	const fixture = _fixture({ rootBytes: Uint8Array.from(bytes) });
	await expect(_prepare(fixture)).rejects.toThrow();
});
it("rejects metadata regions overlapping tile data", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(127n, 56);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects a truncated directory body beyond the former compressed byte budget", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(2097153n, 16);
	fixture.metadata.writeBigUInt64LE(3000000n, 56);
	fixture.archive.bytes = 4000000;
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
	expect(fixture.reads).toHaveLength(2);
});
it("rejects truncated archive responses", async () => {
	const fixture = _fixture();
	td.when(fixture.archive.read(td.matchers.anything())).thenResolve(new Uint8Array(1));
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("checks cancellation before creating or reading any resources", async () => {
	const fixture = _fixture();
	await expect(_prepare(fixture, AbortSignal.abort())).rejects.toThrow();
	expect(fixture.reads).toHaveLength(0);
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it("checks cancellation after pending metadata reads", async () => {
	const fixture = _fixture();
	const controller = new AbortController();
	const read = fixture.archive.read;
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			controller.abort();
			return bytes;
		},
	);
	await expect(_prepare(fixture, controller.signal)).rejects.toThrow();
	expect(readdirSync(fixture.directory)).toEqual([]);
});

it("accepts the Protomaps layout with metadata after the planet payload", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(BigInt(fixture.archive.bytes), 24);
	fixture.metadata.writeBigUInt64LE(1n, 32);
	fixture.archive.bytes++;
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(24);
});
it("flushes bounded member buffers across a large physical plan", async () => {
	const rows = Array.from({ length: 70000 }, (_, index) => ({
		tileId: _start + index,
		offset: index * 10,
		length: 10,
		runLength: index === 69999 ? 4 ** 15 - 69999 : 1,
	}));
	const fixture = _fixture({ rows: rows });
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath).length).toBe(70000 * 24);
});
it("rejects unsafe integer header counters before planning", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(2n ** 60n, 72);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects unsafe integer metadata offsets before reading", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(2n ** 60n, 8);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects missing root directory bytes", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(0n, 16);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects tile members extending beyond the declared tile-data section", async () => {
	const fixture = _fixture();
	fixture.metadata.writeBigUInt64LE(19n, 64);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects metadata ranges extending beyond the archive", async () => {
	const fixture = _fixture();
	fixture.archive.bytes = 127;
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects a child directory whose first address differs from its root pointer", async () => {
	const fixture = _fixture({ leaves: [[{ tileId: _start, offset: 0, length: 10, runLength: 4 ** 15 }]] });
	// The root pointer uses a five-byte tile ID; changing its low byte preserves framing.
	fixture.metadata[128] = (fixture.metadata[128] ?? 0) + 1;
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});

it("rejects directory addresses outside the declared maximum source zoom", async () => {
	const fixture = _fixture({ rows: [{ tileId: _start, offset: 0, length: 10, runLength: 4 ** 15 + 1 }] });
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects source zoom levels exceeding the maintained PMTiles integer limit", async () => {
	const fixture = _fixture();
	fixture.metadata[101] = 27;
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("rejects unreferenced trailing bytes in the leaf directory section", async () => {
	const fixture = _fixture({ leaves: [[{ tileId: _start, offset: 0, length: 10, runLength: 4 ** 15 }]] });
	fixture.metadata.writeBigUInt64LE(fixture.metadata.readBigUInt64LE(48) + 1n, 48);
	fixture.metadata.writeBigUInt64LE(fixture.metadata.readBigUInt64LE(56) + 1n, 56);
	fixture.archive.bytes++;
	const read = fixture.archive.read;
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			return bytes.length === range.length - 1 ? Buffer.concat([bytes, Buffer.from([0])]) : bytes;
		},
	);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
});
it("cancels a large synchronous export when the abort timer becomes runnable", async () => {
	const rows = Array.from({ length: 70000 }, (_, index) => ({
		tileId: _start + index,
		offset: index * 10,
		length: 10,
		runLength: index === 69999 ? 4 ** 15 - 69999 : 1,
	}));
	const fixture = _fixture({ rows: rows });
	const controller = new AbortController();
	const read = fixture.archive.read;
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			if (range.offset === 127) setImmediate(() => controller.abort());
			return bytes;
		},
	);
	await expect(_prepare(fixture, controller.signal)).rejects.toThrow();
	expect(readdirSync(fixture.directory)).toEqual([]);
});

it("preserves a repeated first selected run when content was introduced below zoom15", async () => {
	const fixture = _fixture({
		rows: [
			{ tileId: _start - 1, offset: 0, length: 8, runLength: 1 },
			{ tileId: _start, offset: 0, length: 8, runLength: 2 },
			{ tileId: _start + 2, offset: 8, length: 10, runLength: 1 },
			{ tileId: _start + 3, offset: 0, length: 8, runLength: 4 ** 15 - 3 },
		],
	});
	const plan = await _prepare(fixture);
	const aliases = readFileSync(plan.aliasesPath);
	expect(aliases.length).toBe(32);
	expect(aliases.readUInt32LE(8)).toBe(_start);
	expect(aliases.readUInt32LE(12)).toBe(2);
	expect(aliases.readUInt32LE(24)).toBe(_start + 3);
	expect(aliases.readUInt32LE(28)).toBe(4 ** 15 - 3);
	expect(readFileSync(plan.membersPath).readUInt32LE(16)).toBe(4 ** 15 - 1);
});
it("restarts cleanly after an interrupted scratch database and journal", async () => {
	const fixture = _fixture();
	writeFileSync(join(fixture.directory, "worldwide-plan.sqlite"), "interrupted temporary database");
	writeFileSync(join(fixture.directory, "worldwide-plan.sqlite-journal"), "interrupted journal");
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(24);
	expect(readdirSync(fixture.directory).sort()).toEqual(["aliases.bin", "members.bin"]);
});

it("plans a source15 gzip member larger than the former 32 MiB extraction budget without reading payloads", async () => {
	const fixture = _fixture({ rows: [{ tileId: _start, offset: 0, length: 32 * 1024 * 1024 + 1, runLength: 4 ** 15 }] });
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(24);
	expect(readFileSync(plan.membersPath).readUInt32LE(8)).toBe(32 * 1024 * 1024 + 1);
	expect(fixture.reads).toHaveLength(2);
});
function _threeLeaves(): Entry[][] {
	return [
		[{ tileId: _start, offset: 0, length: 20, runLength: 1 }],
		[{ tileId: _start + 1, offset: 20, length: 20, runLength: 1 }],
		[{ tileId: _start + 2, offset: 40, length: 20, runLength: 4 ** 15 - 2 }],
	];
}
it("coalesces adjacent leaf directories into one region-bounded request", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves() });
	await _prepare(fixture);
	const offset = Number(fixture.metadata.readBigUInt64LE(40));
	const length = Number(fixture.metadata.readBigUInt64LE(48));
	expect(fixture.reads).toEqual([
		{ offset: 0, length: 127 },
		{ offset: 127, length: Number(fixture.metadata.readBigUInt64LE(16)) },
		{ offset: offset, length: length },
	]);
});
it("refills a crossing leaf slab and preserves binary output despite overlapping readahead", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves(), leafCommentBytes: 1800000 });
	const reference = _fixture({ gzip: true, leaves: _threeLeaves() });
	// Keep payload offsets identical while the equivalent metadata uses ordinary small gzip headers.
	reference.metadata.writeBigUInt64LE(BigInt(fixture.dataOffset), 56);
	reference.archive.bytes = fixture.archive.bytes;
	const [plan, equivalent] = await Promise.all([_prepare(fixture), _prepare(reference)]);
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const leafEnd = leafStart + Number(fixture.metadata.readBigUInt64LE(48));
	const reads = fixture.reads.slice(2);
	expect(reads).toHaveLength(2);
	expect(reads[0]).toEqual({ offset: leafStart, length: 4 * 1024 * 1024 });
	expect(reads[1]?.offset).toBeLessThan(leafStart + 4 * 1024 * 1024);
	expect((reads[1]?.offset ?? 0) + (reads[1]?.length ?? 0)).toBe(leafEnd);
	for (const range of reads) {
		expect(range.offset).toBeGreaterThanOrEqual(leafStart);
		expect(range.offset + range.length).toBeLessThanOrEqual(leafEnd);
		expect(range.length).toBeLessThanOrEqual(4 * 1024 * 1024);
	}
	expect(fixture.reads.reduce((sum, range) => sum + range.length, 0)).toBeGreaterThan(fixture.metadata.length);
	expect(readFileSync(plan.membersPath)).toEqual(readFileSync(equivalent.membersPath));
	expect(readFileSync(plan.aliasesPath)).toEqual(readFileSync(equivalent.aliasesPath));
});
it("refetches safely when logical directories visit physical leaf offsets backwards", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves(), leafCommentBytes: 1800000, leafOrder: [2, 1, 0] });
	const plan = await _prepare(fixture);
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const leafEnd = leafStart + Number(fixture.metadata.readBigUInt64LE(48));
	const reads = fixture.reads.slice(2);
	expect(reads).toHaveLength(3);
	expect(reads.map((range) => range.offset)).toEqual(
		[...reads.map((range) => range.offset)].sort((left, right) => right - left),
	);
	for (const range of reads) {
		expect(range.offset).toBeGreaterThanOrEqual(leafStart);
		expect(range.offset + range.length).toBeLessThanOrEqual(leafEnd);
		expect(range.length).toBeLessThanOrEqual(4 * 1024 * 1024);
	}
	expect(readFileSync(plan.membersPath)).toHaveLength(3 * 24);
	expect(readFileSync(plan.membersPath).readUInt32LE(12)).toBe(_start);
});
it("plans valid compressed leaf directories larger than the former 2 MiB byte budget", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves(), leafCommentBytes: 2 * 1024 * 1024 });
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(3 * 24);
});

it("plans every source entry in a directory beyond the former 131,072 entry budget", async () => {
	const rows = Array.from({ length: 131_073 }, (_, index) => ({
		tileId: _start + index,
		offset: index * 10,
		length: 10,
		runLength: index === 131_072 ? 4 ** 15 - 131_072 : 1,
	}));
	const fixture = _fixture({ leaves: [rows] });
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(131_073 * 24);
});

it("plans every source entry in a decompressed leaf beyond the former 2 MiB byte budget", async () => {
	const rows = Array.from({ length: 300_000 }, (_, index) => ({
		tileId: _start + index,
		offset: index * 1000,
		length: 1000,
		runLength: index === 299_999 ? 4 ** 15 - 299_999 : 1,
	}));
	expect(_directory(rows).byteLength).toBeGreaterThan(2 * 1024 * 1024);
	const fixture = _fixture({ gzip: true, leaves: [rows] });
	const plan = await _prepare(fixture);
	expect(readFileSync(plan.membersPath)).toHaveLength(300_000 * 24);
});
it("rejects truncated prefetched slab bodies and removes temporary state", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves() });
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const read = fixture.archive.read;
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			return range.offset === leafStart ? bytes.subarray(0, bytes.length - 1) : bytes;
		},
	);
	await expect(_prepare(fixture)).rejects.toThrow("INVALID_ARCHIVE");
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it("preserves pinned archive read errors during slab fills", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves() });
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const read = fixture.archive.read;
	const failure = new Error("pinned source changed");
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			if (range.offset === leafStart) throw failure;
			return read(range);
		},
	);
	await expect(_prepare(fixture)).rejects.toBe(failure);
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it("honors cancellation after a pending slab response", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves() });
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const read = fixture.archive.read;
	const controller = new AbortController();
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			if (range.offset === leafStart) controller.abort();
			return bytes;
		},
	);
	await expect(_prepare(fixture, controller.signal)).rejects.toThrow();
	expect(fixture.reads).toHaveLength(3);
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it("honors timer cancellation while traversing a prefetched leaf slab", async () => {
	const fixture = _fixture({ gzip: true, leaves: _threeLeaves() });
	const leafStart = Number(fixture.metadata.readBigUInt64LE(40));
	const read = fixture.archive.read;
	const controller = new AbortController();
	fixture.archive.read = td.func<_Archive["read"]>();
	td.when(fixture.archive.read(td.matchers.anything())).thenDo(
		async (range: Parameters<_Archive["read"]>[0]): ReturnType<_Archive["read"]> => {
			const bytes = await read(range);
			if (range.offset === leafStart) setImmediate(() => controller.abort());
			return bytes;
		},
	);
	await expect(_prepare(fixture, controller.signal)).rejects.toThrow();
	expect(fixture.reads).toHaveLength(3);
	expect(readdirSync(fixture.directory)).toEqual([]);
});
it("isolates prefetched leaf state across concurrent invocations on the same service", async () => {
	const first = _fixture({ gzip: true, leaves: [[{ tileId: _start, offset: 0, length: 10, runLength: 4 ** 15 }]] });
	const second = _fixture({ gzip: true, leaves: [[{ tileId: _start, offset: 0, length: 11, runLength: 4 ** 15 }]] });
	second.service = first.service;
	const [left, right] = await Promise.all([_prepare(first), _prepare(second)]);
	expect(readFileSync(left.membersPath).readUInt32LE(8)).toBe(10);
	expect(readFileSync(right.membersPath).readUInt32LE(8)).toBe(11);
	expect(first.reads).toHaveLength(3);
	expect(second.reads).toHaveLength(3);
});
