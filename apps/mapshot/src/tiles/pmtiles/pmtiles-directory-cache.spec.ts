import { InvalidPmtilesCacheEntriesError } from "./errors/invalid-pmtiles-cache-entries.error";
import { InvalidPmtilesDecodedEntriesError } from "./errors/invalid-pmtiles-decoded-entries.error";
import { AppErrorCode } from "../../errors/index";
import { afterEach, expect, it, vi } from "vitest";
import * as td from "testdouble";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";
import { Compression, PMTiles, bytesToHeader, tileIdToZxy, type Source } from "pmtiles";
import { PmtilesDirectoryCache } from "./pmtiles-directory-cache";
import census from "./fixtures/world-census.json";

afterEach(() => td.reset());

function _source(params: {
	key: string;
	signal?: AbortSignal;
	read: Source["getBytes"];
}): Source & { operationSignal: AbortSignal } {
	const source = td.object<Source & { operationSignal: AbortSignal }>();
	source.operationSignal = params.signal ?? new AbortController().signal;
	td.when(source.getKey()).thenReturn(params.key);
	td.when(source.getBytes(td.matchers.anything(), td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(
		params.read,
	);
	return source;
}

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses invalid value budget %s", (value) => {
	expect(() => new PmtilesDirectoryCache({ maximumEntries: value })).toThrow(InvalidPmtilesCacheEntriesError);
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses invalid decoded-entry budget %s", (value) => {
	expect(() => new PmtilesDirectoryCache({ maximumEntries: 4, maximumDecodedEntries: value })).toThrow(
		InvalidPmtilesDecodedEntriesError,
	);
});

it("refuses sources without an operation signal before reading bytes", async () => {
	const cache = new PmtilesDirectoryCache({ maximumEntries: 2 });
	const source = td.object<Source>();
	td.when(source.getKey()).thenReturn("source");
	await expect(cache.getHeader(source)).rejects.toMatchObject({
		errorCode: AppErrorCode.PMTILES_OPERATION_SIGNAL_MISSING,
	});
	td.verify(source.getBytes(td.matchers.anything(), td.matchers.anything()), { times: 0, ignoreExtraArgs: true });
});

it.each([Compression.None, Compression.Gzip])(
	"decompresses resources exceeding former byte budgets with compression %s",
	async (compression) => {
		const cache = new PmtilesDirectoryCache({ maximumEntries: 2 });
		const bytes = new Uint8Array(8 * 1024 * 1024 + 1).fill(42);
		const encoded = compression === Compression.Gzip ? Uint8Array.from(gzipSync(bytes)).buffer : bytes.buffer;
		expect(
			Buffer.from(await cache.decompressResource({ bytes: encoded, compression: compression })).equals(bytes),
		).toBe(true);
	},
);

it("rejects unsupported resource compression", async () => {
	const cache = new PmtilesDirectoryCache({ maximumEntries: 2 });
	await expect(
		cache.decompressResource({ bytes: new ArrayBuffer(0), compression: Compression.Zstd }),
	).rejects.toMatchObject({ errorCode: AppErrorCode.PMTILES_COMPRESSION_UNSUPPORTED });
});

it.each([
	Uint8Array.of(0),
	Uint8Array.of(1, 0, 1, 4, 128),
	Uint8Array.of(1, 0, 1, 4, 1, 0),
	Uint8Array.of(1, 128, 128, 128, 128, 128, 128, 128, 128, 16, 1, 4, 1),
	Uint8Array.of(129, 128, 8),
])("refuses malformed directories before the authoritative decoder reads them", async (bytes) => {
	const cache = new PmtilesDirectoryCache({ maximumEntries: 2 });
	await expect(cache.decompress(bytes.buffer, Compression.None)).rejects.toThrow();
});

it.each(
	["entry-count", "tile-id", "run-length", "length", "offset"].map((field, index) => ({ field: field, index: index })),
)("rejects an overflowing uint64 $field instead of accepting its wrapped decoded value", async ({ index }) => {
	const fields = [1, 0, 1, 4, 1].map((value) => [value]);
	fields[index] = [fields[index]![0]! | 0x80, ...Array<number>(8).fill(0x80), 2];
	const bytes = Uint8Array.from(fields.flat());
	const cache = new PmtilesDirectoryCache({ maximumEntries: 2 });
	await expect(cache.decompress(bytes.buffer, Compression.None)).rejects.toMatchObject({
		errorCode: AppErrorCode.PMTILES_DIRECTORY_INVALID,
	});
});

class _TileBodyProbe extends Error {
	constructor(
		readonly offset: number,
		readonly length: number,
	) {
		super("Saved metadata lookup reached deliberately unavailable tile body.");
	}
}
function _fixture(): {
	bootstrap: Uint8Array<ArrayBuffer>;
	cache: PmtilesDirectoryCache;
	calls: { kind: "bootstrap" | "leaf" | "tile-probe"; offset: number; length: number }[];
	source: () => Source & { operationSignal: AbortSignal };
} {
	const bootstrap = Uint8Array.from(
		readFileSync(new URL("../../../build/data/references/fixtures/world-header-root.bin", import.meta.url)),
	);
	const leaf = Uint8Array.from(
		readFileSync(new URL("../../../build/data/references/fixtures/world-leaf.bin", import.meta.url)),
	);
	const cache = new PmtilesDirectoryCache({
		maximumEntries: 4,
		maximumDecodedEntries: 131072,
	});
	const calls: Array<{ kind: "bootstrap" | "leaf" | "tile-probe"; offset: number; length: number }> = [];
	const source = (): Source & { operationSignal: AbortSignal } =>
		_source({
			key: census.sourceId,
			read: async (offset, length) => {
				if (offset === 0) {
					calls.push({ kind: "bootstrap", offset: offset, length: length });
					return { data: bootstrap.slice().buffer, etag: "fixture-world-etag" };
				}
				if (offset === census.readDirectories[1]!.offset) {
					calls.push({ kind: "leaf", offset: offset, length: length });
					return { data: leaf.slice().buffer, etag: "fixture-world-etag" };
				}
				calls.push({ kind: "tile-probe", offset: offset, length: length });
				throw new _TileBodyProbe(offset, length);
			},
		});
	return { bootstrap: bootstrap, cache: cache, calls: calls, source: source };
}

it("same-operation concurrent headers share one read while later reads reuse completed values", async () => {
	const fixture = _fixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const source = fixture.source();
	const original = source.getBytes;
	source.getBytes = td.func<Source["getBytes"]>();
	td.when(source.getBytes(td.matchers.anything(), td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(
		async (offset: number, length: number): ReturnType<Source["getBytes"]> => {
			entered.resolve();
			await release.promise;
			return original(offset, length);
		},
	);
	const first = fixture.cache.getHeader(source);
	await entered.promise;
	const second = fixture.cache.getHeader(source);
	release.resolve();
	expect(await second).toEqual(await first);
	expect(await fixture.cache.getHeader(source)).toEqual(await first);
	expect(fixture.calls).toHaveLength(1);
});

it("same-operation concurrent leaves share one load without affecting request isolation", async () => {
	const fixture = _fixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const source = fixture.source();
	const header = bytesToHeader(fixture.bootstrap.slice(0, 127).buffer, "fixture-world-etag");
	const original = source.getBytes;
	source.getBytes = td.func<Source["getBytes"]>();
	td.when(source.getBytes(td.matchers.anything(), td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(
		async (offset: number, length: number): ReturnType<Source["getBytes"]> => {
			entered.resolve();
			await release.promise;
			return original(offset, length);
		},
	);
	const offset = census.readDirectories[1]!.offset;
	const length = census.readDirectories[1]!.length;
	const first = fixture.cache.getDirectory(source, offset, length, header);
	await entered.promise;
	const second = fixture.cache.getDirectory(source, offset, length, header);
	release.resolve();
	expect(await second).toEqual(await first);
	expect(fixture.calls).toHaveLength(1);
});

it("repeated genuine directory hits reuse validated immutable entries while changed section bounds remain checked", async () => {
	const fixture = _fixture();
	const source = fixture.source();
	const header = bytesToHeader(fixture.bootstrap.slice(0, 127).buffer, "fixture-world-etag");
	const offset = census.readDirectories[1]!.offset;
	const length = census.readDirectories[1]!.length;
	const entries = await fixture.cache.getDirectory(source, offset, length, header);
	expect(Object.isFrozen(entries)).toBe(true);
	expect(entries.every((entry) => Object.isFrozen(entry))).toBe(true);
	const checks = vi.spyOn(Number, "isSafeInteger");
	try {
		expect(await fixture.cache.getDirectory(fixture.source(), offset, length, header)).toBe(entries);
		expect(checks).not.toHaveBeenCalled();
	} finally {
		checks.mockRestore();
	}
	await expect(
		fixture.cache.getDirectory(source, offset, length, { ...header, tileDataLength: 1 }),
	).rejects.toMatchObject({ errorCode: AppErrorCode.PMTILES_DIRECTORY_INVALID });
});

it("completed metadata is never promoted after its operation is cancelled", async () => {
	const fixture = _fixture();
	const controller = new AbortController();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const source = fixture.source();
	const original = source.getBytes;
	source.operationSignal = controller.signal;
	source.getBytes = td.func<Source["getBytes"]>();
	td.when(source.getBytes(td.matchers.anything(), td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(
		async (offset: number, length: number): ReturnType<Source["getBytes"]> => {
			entered.resolve();
			await release.promise;
			return original(offset, length);
		},
	);
	const first = fixture.cache.getHeader(source);
	await entered.promise;
	controller.abort();
	release.resolve();
	await expect(first).rejects.toMatchObject({ name: "AbortError" });
	expect(fixture.cache.stats()).toEqual({ values: 0, entries: 0 });
});

it("cold and completed-cache genuine PMTiles metadata preserve every selected tile payload offset and length", async () => {
	const fixture = _fixture();
	for (let pass = 0; pass < 2; pass++) {
		for (const expected of census.contents) {
			const coordinates = tileIdToZxy(expected.intervals[0]!.start);
			await expect(new PMTiles(fixture.source(), fixture.cache).getZxy(...coordinates)).rejects.toMatchObject({
				name: "Error",
				offset: expected.offset,
				length: expected.length,
			});
		}
	}
	expect(fixture.calls.filter((call) => call.kind === "bootstrap")).toHaveLength(1);
	expect(fixture.calls.filter((call) => call.kind === "leaf")).toHaveLength(1);
	expect(fixture.calls.filter((call) => call.kind === "tile-probe")).toHaveLength(32);
	expect(fixture.cache.stats()).toEqual({ values: 3, entries: 64011 });
});

it("more than 256 cold callers read independently without an admission cap or sharing request-owned promises", async () => {
	const fixture = _fixture();
	let active = 0;
	let peak = 0;
	const reading = Array.from({ length: 258 }, (_, index) => {
		const source = fixture.source();
		const isolated = _source({
			signal: source.operationSignal,
			key: `cold-${index}`,
			read: async (offset, length) => {
				active++;
				peak = Math.max(peak, active);
				try {
					await new Promise<void>((resolve) => setTimeout(resolve, 10));
					return await source.getBytes(offset, length);
				} finally {
					active--;
				}
			},
		});
		return fixture.cache.getHeader(isolated);
	});
	expect((await Promise.allSettled(reading)).every((result) => result.status === "fulfilled")).toBe(true);
	expect(peak).toBe(258);
});

it.each([
	{ tileId: Number.NaN },
	{ tileId: 0.5 },
	{ offset: Number.NaN },
	{ offset: Number.POSITIVE_INFINITY },
	{ length: Number.POSITIVE_INFINITY },
	{ length: 1.5 },
	{ runLength: Number.NaN },
	{ runLength: 1.5 },
])("a completed directory still rejects non-integral or unsafe entry fields %o", async (change) => {
	const fixture = _fixture();
	const source = fixture.source();
	const header = bytesToHeader(fixture.bootstrap.slice(0, 127).buffer, "fixture-world-etag");
	const key = `${source.getKey()}|${header.etag}|${header.rootDirectoryOffset}|${header.rootDirectoryLength}`;
	fixture.cache.cache.set(key, { lastUsed: 0, data: [{ tileId: 0, offset: 0, length: 1, runLength: 1, ...change }] });
	await expect(
		fixture.cache.getDirectory(source, header.rootDirectoryOffset, header.rootDirectoryLength, header),
	).rejects.toMatchObject({ errorCode: AppErrorCode.PMTILES_DIRECTORY_INVALID });
	expect(fixture.calls).toHaveLength(0);
});

it.each([131071, 131072, 131073, 524288])(
	"the fixed aggregate budget retains only fitting root-plus-leaf metadata at %i entries",
	async (count) => {
		const encoded: number[] = [];
		const push = (number: number): void => {
			let value = number;
			while (value >= 128) {
				encoded.push((value % 128) + 128);
				value = Math.floor(value / 128);
			}
			encoded.push(value);
		};
		push(count);
		for (let index = 0; index < count; index++) push(index === 0 ? 0 : 1);
		for (let index = 0; index < count; index++) push(1);
		for (let index = 0; index < count; index++) push(4);
		for (let index = 0; index < count; index++) push(1);
		const leaf = Uint8Array.from(encoded);
		encoded.length = 0;
		push(1);
		push(0);
		push(0);
		push(leaf.length);
		push(1);
		const root = Uint8Array.from(encoded);
		const bytes = new Uint8Array(16384 + leaf.length + 4);
		bytes.set(new TextEncoder().encode("PMTiles"));
		bytes[7] = 3;
		const view = new DataView(bytes.buffer);
		for (const [offset, value] of [
			[8, 127],
			[16, root.length],
			[24, 127 + root.length],
			[32, 2],
			[40, 16384],
			[48, leaf.length],
			[56, 16384 + leaf.length],
			[64, 4],
			[72, count],
			[80, count],
			[88, 1],
		])
			view.setBigUint64(offset!, BigInt(value!), true);
		bytes[97] = 1;
		bytes[98] = 1;
		bytes[99] = 1;
		bytes[101] = 15;
		bytes.set(root, 127);
		bytes.set(new TextEncoder().encode("{}"), 127 + root.length);
		bytes.set(leaf, 16384);
		bytes.set(Uint8Array.of(1, 2, 3, 4), 16384 + leaf.length);
		const cache = new PmtilesDirectoryCache({
			maximumEntries: 4,
			maximumDecodedEntries: 131072,
		});
		const metadata: number[] = [];
		for (let request = 0; request < 4; request++) {
			const source = _source({
				key: `bounded-synthetic-leaf-${count}`,
				read: async (offset, length) => {
					if (offset === 0 || offset === 16384) metadata.push(offset);
					return { data: bytes.slice(offset, offset + length).buffer, etag: "synthetic-etag" };
				},
			});
			expect(new Uint8Array((await new PMTiles(source, cache).getZxy(0, 0, 0))!.data)).toEqual(
				Uint8Array.of(1, 2, 3, 4),
			);
		}
		expect(metadata).toHaveLength(count === 131071 ? 2 : 8);
		expect(cache.stats().entries).toBeLessThanOrEqual(131072);
	},
);
