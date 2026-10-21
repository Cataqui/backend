import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as td from "testdouble";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PackedLandmarkKinds } from "../../../../src/landmark/index/packed-landmark-format";
import { ReferenceImportErrorCode } from "../reference-import-error-code.enum";
import { ReferenceImportError } from "../reference-import.error";
import { WorldwidePointSpoolRowSchema } from "./schemas/worldwide-point-spool-row.schema";
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
});

function _point(): WorldwideDecodedPoint {
	return {
		ordinal: 2,
		id: "18446744073709551615",
		category: "hospital",
		name: "病院\u2028Praça",
		names: { "name:ja": "病院" },
		detail: null,
		minZoom: 12,
		rank: 1,
		u: 0.5,
		v: 0.25,
	};
}
function _batch(): { bytes: ArrayBuffer; records: ArrayBuffer } {
	const bytes = gzipSync(Uint8Array.of(1, 2, 3));
	const records = Buffer.alloc(24);
	records.writeUInt32LE(bytes.length, 4);
	records.writeUInt32LE(400000000, 8);
	records.writeUInt32LE(3, 12);
	records.writeBigUInt64LE(139000000000n, 16);
	return { bytes: Uint8Array.from(bytes).buffer, records: Uint8Array.from(records).buffer };
}
function _service(): WorldwidePointExtractionService {
	return new WorldwidePointExtractionService({
		path: "points.ndjson",
	});
}

it("spools physical provenance and multiplicity, then hashes exactly the generated rows", () => {
	td.when(
		decodeWorldwidePoints({ bytes: Buffer.from([1, 2, 3]), categories: new Set(PackedLandmarkKinds) }),
	).thenReturn([_point()]);
	const service = _service();
	service.extract(_batch());
	const expected = Buffer.from(
		`${JSON.stringify([139000000000, 3, 400000000, 2, "18446744073709551615", "hospital", "病院\u2028Praça", { "name:ja": "病院" }, null, 12, 1, 0.5, 0.25])}\n`,
	);
	td.when(_repository.write({ descriptor: 7, bytes: expected, offset: 0 })).thenReturn(expected.length);
	expect(service.finish()).toEqual({
		file: {
			path: "points.ndjson",
			bytes: expected.length,
			lines: 1,
			sha256: createHash("sha256").update(expected).digest("hex"),
		},
		sharedContents: 1,
	});
	const spool = td.matchers.captor();
	td.verify(_repository.write(spool.capture()));
	const written: Parameters<WorldwidePointSpoolRepository["write"]>[0] = spool.value;
	expect(WorldwidePointSpoolRowSchema.parse(JSON.parse(Buffer.from(written.bytes).toString("utf8")))).toEqual([
		139000000000,
		3,
		400000000,
		2,
		"18446744073709551615",
		"hospital",
		"病院\u2028Praça",
		{ "name:ja": "病院" },
		null,
		12,
		1,
		0.5,
		0.25,
	]);
	td.verify(_repository.close({ descriptor: 7 }), { times: 1 });
});

it("continues a partial spool write from the exact unwritten offset", () => {
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([_point()]);
	const writes: number[] = [];
	td.when(_repository.write(td.matchers.anything())).thenDo(
		(params: { descriptor: number; bytes: Uint8Array; offset: number }): number => {
			writes.push(params.offset);
			return params.offset === 0 ? 8 : params.bytes.byteLength - params.offset;
		},
	);
	const service = _service();
	service.extract(_batch());
	expect(service.finish().file.lines).toBe(1);
	expect(writes).toEqual([0, 8]);
});

it.each([
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
] as const)("spools the admitted %s kind unchanged through the authoritative row contract", (kind) => {
	const point = { ..._point(), category: kind };
	const writes: Uint8Array[] = [];
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([point]);
	td.when(_repository.write(td.matchers.anything())).thenDo(
		(params: Parameters<WorldwidePointSpoolRepository["write"]>[0]): number => {
			writes.push(params.bytes);
			return params.bytes.byteLength;
		},
	);
	const service = _service();
	service.extract(_batch());
	expect(service.finish().file.lines).toBe(1);
	expect(writes).toHaveLength(1);
	const row = WorldwidePointSpoolRowSchema.parse(JSON.parse(Buffer.from(writes[0]!).toString("utf8")));
	expect(row[4]).toBe(point.id);
	expect(row[5]).toBe(kind);
	expect(row[6]).toBe(point.name);
});

it("finishes an empty batch without writing and closes its spool only once", () => {
	const service = _service();
	service.extract({ bytes: new ArrayBuffer(0), records: new ArrayBuffer(0) });
	expect(service.finish().file).toEqual({
		path: "points.ndjson",
		bytes: 0,
		lines: 0,
		sha256: createHash("sha256").digest("hex"),
	});
	service.close();
	td.verify(_repository.close({ descriptor: 7 }), { times: 1 });
	td.verify(_repository.write(td.matchers.anything()), { times: 0 });
	expect(() => service.finish()).toThrow(expect.objectContaining({ code: ReferenceImportErrorCode.CLOSED }));
	expect(() => service.extract(_batch())).toThrow(expect.objectContaining({ code: ReferenceImportErrorCode.CLOSED }));
});

it("keeps a failed spool available for the owner to close", () => {
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([_point()]);
	const failure = new Error("disk failure");
	td.when(_repository.write(td.matchers.anything())).thenThrow(failure);
	const service = _service();
	service.extract(_batch());
	expect(() => service.finish()).toThrow(failure);
	service.close();
	td.verify(_repository.close({ descriptor: 7 }), { times: 1 });
});

it("fails an incomplete zero-byte spool write and leaves cleanup with its owner", () => {
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenReturn([_point()]);
	td.when(_repository.write(td.matchers.anything())).thenReturn(0);
	const service = _service();
	service.extract(_batch());
	expect(() => service.finish()).toThrow(
		new ReferenceImportError({
			code: ReferenceImportErrorCode.INCOMPLETE,
			message: "Landmark point spool write made no progress",
		}),
	);
	service.close();
	td.verify(_repository.close({ descriptor: 7 }), { times: 1 });
});

it("rejects corrupt external gzip data before calling the point decoder", () => {
	const service = _service();
	expect(() => service.extract({ ..._batch(), bytes: Uint8Array.of(0, 1, 2).buffer })).toThrow(/header/u);
	td.verify(decodeWorldwidePoints(td.matchers.anything()), { times: 0 });
	service.close();
});

it("preserves the decoder's validation error for external vector tile contents", () => {
	const failure = new ReferenceImportError({
		code: ReferenceImportErrorCode.INTEGRITY,
		message: "Invalid worldwide landmark MVT",
	});
	td.when(decodeWorldwidePoints(td.matchers.anything())).thenThrow(failure);
	const service = _service();
	expect(() => service.extract(_batch())).toThrow(failure);
	service.close();
});
