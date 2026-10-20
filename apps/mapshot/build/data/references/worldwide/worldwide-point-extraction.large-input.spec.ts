import { gzipSync } from "node:zlib";
import * as td from "testdouble";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeWorldwidePoints, type WorldwideDecodedPoint } from "./worldwide-point.decoder";
import { WorldwidePointExtractionService } from "./worldwide-point-extraction.service";
import { WorldwidePointSpoolRepository } from "./worldwide-point-spool.repository";

vi.mock("./worldwide-point.decoder.ts", async () => {
	const doubles = await import("testdouble");
	return { decodeWorldwidePoints: doubles.func<typeof decodeWorldwidePoints>() };
});
vi.mock("./worldwide-point-spool.repository.ts", async () => {
	const doubles = await import("testdouble");
	return { WorldwidePointSpoolRepository: doubles.func<typeof WorldwidePointSpoolRepository>() };
});

afterEach(() => td.reset());
let _repository: WorldwidePointSpoolRepository;
beforeEach(() => {
	_repository = td.object<WorldwidePointSpoolRepository>();
	td.when(new WorldwidePointSpoolRepository()).thenReturn(_repository);
	td.when(_repository.open({ path: "points.ndjson" })).thenReturn(7);
	td.when(_repository.write({ descriptor: 7, bytes: td.matchers.anything(), offset: 0 })).thenDo(
		(params: { descriptor: number; bytes: Uint8Array; offset: number }): number => params.bytes.length - params.offset,
	);
});

function _batch(bytes: Buffer): { bytes: ArrayBuffer; records: ArrayBuffer } {
	const records = Buffer.alloc(24);
	records.writeUInt32LE(bytes.length, 4);
	records.writeUInt32LE(400000000, 8);
	records.writeUInt32LE(1, 12);
	records.writeBigUInt64LE(139000000000n, 16);
	return { bytes: Uint8Array.from(bytes).buffer, records: Uint8Array.from(records).buffer };
}

it("forwards a decompressed member larger than the former 16 MiB budget to the decoder", () => {
	const decoded = Buffer.alloc(16 * 1024 * 1024 + 1, 1);
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([]);
	const service = new WorldwidePointExtractionService({ path: "points.ndjson" });
	service.extract(_batch(gzipSync(decoded)));
	const input = td.matchers.captor();
	td.verify(decodeWorldwidePoints(input.capture()));
	const received: Parameters<typeof decodeWorldwidePoints>[0] = input.value;
	expect(Buffer.from(received.bytes).equals(decoded)).toBe(true);
	expect(service.finish().file.lines).toBe(0);
});

it("consumes a complete gzip member larger than the former 32 MiB compressed budget", () => {
	const tile = gzipSync(Uint8Array.of(1, 2, 3));
	const header = Buffer.from(tile.subarray(0, 10));
	header[3] = (header[3] ?? 0) | 0x10;
	const member = Buffer.concat([header, Buffer.alloc(32 * 1024 * 1024, 0x78), Uint8Array.of(0), tile.subarray(10)]);
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([]);
	const service = new WorldwidePointExtractionService({ path: "points.ndjson" });
	service.extract(_batch(member));
	const input = td.matchers.captor();
	td.verify(decodeWorldwidePoints(input.capture()));
	const received: Parameters<typeof decodeWorldwidePoints>[0] = input.value;
	expect(received.bytes).toEqual(Buffer.from([1, 2, 3]));
	expect(service.finish().file.lines).toBe(0);
});

it("flushes a large decoded point during extraction and excludes it from the next flush", () => {
	const point = {
		ordinal: 0,
		id: "1",
		category: "hospital",
		name: "病院".repeat(50_000),
		names: {},
		detail: null,
		minZoom: null,
		rank: null,
		u: 0.5,
		v: 0.5,
	} satisfies WorldwideDecodedPoint;
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([point]);
	const service = new WorldwidePointExtractionService({ path: "points.ndjson" });
	service.extract(_batch(gzipSync(Uint8Array.of(1))));
	const spool = td.matchers.captor();
	td.verify(_repository.write(spool.capture()), { times: 1 });
	const written: Parameters<WorldwidePointSpoolRepository["write"]>[0] = spool.value;
	expect(written.bytes.length).toBeGreaterThan(256 * 1024);
	expect(service.finish().file).toMatchObject({ bytes: written.bytes.length, lines: 1 });
	td.verify(_repository.write(td.matchers.anything()), { times: 1 });
});
