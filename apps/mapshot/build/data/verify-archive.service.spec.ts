import { ReferenceImportErrorCode } from "./references/reference-import-error-code.enum";
import { SourceImportErrorCode } from "./source-import-error-code.enum";
import * as td from "testdouble";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash as createBlake3Hash } from "blake3-wasm";
import { Compression } from "pmtiles";
import { afterEach, expect, it } from "vitest";
import { createPackedLandmarkIndexFixture } from "../../test/landmark-index.fixture";
import { LandmarkIndexService } from "../../src/landmark/landmark-index.service";
import type { ProtomapsSourceArchive } from "./contracts/provider/protomaps-source-archive.schema";
import type { SourceImportCheckpoint } from "./contracts/import/source-import-checkpoint.schema";
import { ReferenceImportError } from "./references/reference-import.error";
import { WorldwideReferenceImportService } from "./references/worldwide/worldwide-reference-import.service";
import { SourceImportError } from "./source-import.error";
import { VerifyArchiveService } from "./verify-archive.service";

type _Repository = ConstructorParameters<typeof VerifyArchiveService>[0]["archiveRangeService"];
type _Session = WorldwideReferenceImportService;
type _Consume = (params: { offset: number; length: number }) => Promise<void>;
type _Prepare = (params: Parameters<typeof WorldwideReferenceImportService.prepare>[0]) => Promise<_Session>;
const _directories: string[] = [];

afterEach(() => td.reset());

afterEach(() => {
	for (const directory of _directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function _digest(bytes: Uint8Array): string {
	const hash = createBlake3Hash();
	try {
		return hash.update(bytes).digest("hex");
	} finally {
		hash.dispose();
	}
}

function _uint(input: bigint | number): Buffer {
	let value = BigInt(input);
	const output: number[] = [];
	do {
		const rest = value >> 7n;
		output.push(Number(value & 127n) | (rest ? 128 : 0));
		value = rest;
	} while (value);
	return Buffer.from(output);
}

function _field(number: number, value: string | Buffer | number | bigint, wire: number = 2): Buffer {
	const body = typeof value === "string" ? Buffer.from(value) : Buffer.isBuffer(value) ? value : _uint(value);
	return Buffer.concat([_uint(number * 8 + wire), ...(wire === 2 ? [_uint(body.length)] : []), body]);
}

function _worldArchive(): Buffer {
	const poi = gzipSync(
		_field(
			3,
			Buffer.concat([
				_field(1, "pois"),
				_field(
					2,
					Buffer.concat([
						_field(1, 9007199254740993n, 0),
						_field(2, Buffer.from([0, 0, 1, 1])),
						_field(3, 1, 0),
						_field(4, Buffer.from([9, 128, 32, 128, 32])),
					]),
				),
				_field(3, "name"),
				_field(3, "kind"),
				_field(4, _field(1, "Hospital")),
				_field(4, _field(1, "hospital")),
				_field(5, 4096, 0),
				_field(15, 2, 0),
			]),
		),
	);
	// The remaining world addresses share an empty member, avoiding any POI alias expansion.
	const empty = gzipSync(_field(3, _field(1, "water")));
	const root = gzipSync(
		Buffer.concat([
			_uint(2),
			_uint((4 ** 15 - 1) / 3),
			_uint(1),
			_uint(1),
			_uint(4 ** 15 - 1),
			_uint(poi.length),
			_uint(empty.length),
			_uint(1),
			_uint(poi.length + 1),
		]),
	);
	const header = Buffer.alloc(127);
	header.write("PMTiles");
	header[7] = 3;
	for (const [offset, value] of [
		[8, 127],
		[16, root.length],
		[24, 127 + root.length],
		[32, 0],
		[40, 127 + root.length],
		[48, 0],
		[56, 127 + root.length],
		[64, poi.length + empty.length],
		[72, 4 ** 15],
		[80, 2],
		[88, 2],
	] as const)
		header.writeBigUInt64LE(BigInt(value), offset);
	header.set([1, Compression.Gzip, Compression.Gzip, 1, 0, 15], 96);
	return Buffer.concat([header, root, poi, empty]);
}

function _checkpoint(params: {
	archive: ProtomapsSourceArchive;
	objectKey: string;
	objectEtag: string | null;
}): SourceImportCheckpoint {
	return {
		schemaVersion: 1,
		id: "a".repeat(64),
		input: { id: "a".repeat(64), archive: params.archive },
		generation: 0,
		stage: "verifying",
		updatedAt: 100,
		objectKey: params.objectKey,
		uploadId: null,
		sourceEtag: null,
		objectEtag: params.objectEtag,
		verifiedArchive: null,
		packedIndex: null,
		parts: [],
		status: { kind: "running", id: "a".repeat(64), phase: "verifying", updatedAt: 100 },
	};
}

function _fixture(params: { bytes?: number; minZoom?: number; maxZoom?: number } = {}): {
	input: Parameters<VerifyArchiveService["verifyAndExtractLandmarks"]>[0];
	bytes: Uint8Array<ArrayBuffer>;
	packed: ReturnType<typeof createPackedLandmarkIndexFixture>;
	output: Awaited<ReturnType<_Session["finish"]>>;
	packedPath: string;
	repository: _Repository;
	readRange: _Repository["readRange"];
	consume: _Consume;
	finish: _Session["finish"];
	dispose: _Session["dispose"];
	prepare: typeof WorldwideReferenceImportService.prepare;
	session: _Session;
	service: VerifyArchiveService;
} {
	const bytes = new Uint8Array(params.bytes ?? 257);
	bytes.set(new TextEncoder().encode("PMTiles"));
	bytes[7] = 3;
	bytes[99] = 1;
	bytes[100] = params.minZoom ?? 0;
	bytes[101] = params.maxZoom ?? 15;
	const archive: ProtomapsSourceArchive = {
		key: "20261011.pmtiles",
		bytes: bytes.length,
		blake3: _digest(bytes),
		version: "4.15.2",
		observedAt: 1000,
	};
	const directory = mkdtempSync(join(tmpdir(), "mapshot-verify-archive-"));
	_directories.push(directory);
	const spool = join(directory, "extraction", "packed");
	mkdirSync(spool, { recursive: true });
	const packed = createPackedLandmarkIndexFixture({ archiveId: archive.blake3 });
	const packedPath = join(spool, "landmarks.pmtiles");
	writeFileSync(packedPath, packed.bytes);
	const output = {
		path: packedPath,
		bytes: packed.bytes.length,
		sha256: packed.reference.sha256,
	} satisfies Awaited<ReturnType<_Session["finish"]>>;
	const repository = td.object<_Repository>();
	td.when(repository.readRange(td.matchers.anything())).thenDo(
		async ({ offset, length }: Parameters<_Repository["readRange"]>[0]): ReturnType<_Repository["readRange"]> =>
			bytes.slice(offset, offset + length),
	);
	const session = td.object<_Session>();
	const consume = td.func<_Consume>();
	td.when(consume(td.matchers.anything())).thenResolve(undefined);
	// Testdouble clones call arguments; retain large binary buffers in this fixture adapter.
	session.consume = async (request: Parameters<_Session["consume"]>[0]): ReturnType<_Consume> => {
		await consume({ offset: request.offset, length: request.bytes.length });
	};
	td.when(session.finish()).thenResolve(output);
	td.when(session.dispose()).thenDo(async (): ReturnType<_Session["dispose"]> => {
		rmSync(join(directory, "extraction"), { recursive: true, force: true });
	});
	const prepare = td.replace(WorldwideReferenceImportService, "prepare");
	td.when(prepare(td.matchers.anything())).thenResolve(session);
	const readRange = repository.readRange;
	const finish = session.finish;
	const dispose = session.dispose;
	const input = {
		checkpoint: _checkpoint({
			archive: archive,
			objectKey: "source/import/attempts/source/1/archive.pmtiles",
			objectEtag: "pinned-etag",
		}),
		workDirectory: directory,
		deadlineAt: Date.now() + 320 * 60_000,
	};
	return {
		input: input,
		bytes: bytes,
		packed: packed,
		output: output,
		packedPath: packedPath,
		repository: repository,
		readRange: readRange,
		consume: consume,
		finish: finish,
		dispose: dispose,
		prepare: prepare,
		session: session,
		service: new VerifyArchiveService({ archiveRangeService: repository }),
	};
}

function _controlledDeadline(): AbortController {
	const controller = new AbortController();
	const timeout = td.replace(AbortSignal, "timeout");
	td.when(timeout(td.matchers.anything())).thenReturn(controller.signal);
	return controller;
}

it("returns verified source identity and preserves the completed landmark file through spool cleanup", async () => {
	const fixture = _fixture();
	const result = await fixture.service.verifyAndExtractLandmarks(fixture.input);
	expect(result).toEqual({
		archive: {
			id: fixture.input.checkpoint.input.archive.blake3,
			objectKey: fixture.input.checkpoint.objectKey,
			bytes: fixture.bytes.length,
			etag: fixture.input.checkpoint.objectEtag,
			digest: { algorithm: "blake3", value: fixture.input.checkpoint.input.archive.blake3, verified: true },
			minZoom: 0,
			maxZoom: 15,
			coverage: "complete-planet",
		},
		landmarks: {
			path: join(fixture.input.workDirectory, "landmarks.pmtiles"),
			sha256: fixture.packed.reference.sha256,
			bytes: fixture.packed.bytes.length,
			archiveId: fixture.input.checkpoint.input.archive.blake3,
		},
	});
	expect(readFileSync(result.landmarks.path)).toEqual(Buffer.from(fixture.packed.bytes));
	expect(existsSync(join(fixture.input.workDirectory, "extraction"))).toBe(false);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
	expect(
		td
			.explain(fixture.readRange)
			.calls.map((call) => call.args)
			.map(([request]) => [request.offset, request.length]),
	).toEqual([
		[0, 127],
		[0, fixture.bytes.length],
	]);
});

it("plans extraction through the same conditional stored range reader", async () => {
	const fixture = _fixture();
	td.when(fixture.prepare(td.matchers.anything()), { times: 1 }).thenDo(
		async (request: Parameters<_Prepare>[0]): ReturnType<_Prepare> => {
			expect(request.workDirectory).toBe(fixture.input.workDirectory);
			expect(request.signal).toBe(td.explain(fixture.readRange).calls[0]!.args[0].signal);
			expect(request.archive.bytes).toBe(fixture.bytes.length);
			expect(await request.archive.read({ offset: 127, length: 7 })).toEqual(fixture.bytes.slice(127, 134));
			return fixture.session;
		},
	);
	await fixture.service.verifyAndExtractLandmarks(fixture.input);
	for (const [request] of td.explain(fixture.readRange).calls.map((call) => call.args))
		expect(request).toMatchObject({
			key: fixture.input.checkpoint.objectKey,
			etag: fixture.input.checkpoint.objectEtag,
			signal: td.explain(fixture.readRange).calls[0]!.args[0].signal,
		});
});

it("verifies a real world archive and retains its extracted landmarks through worker and spool cleanup", async () => {
	const bytes = _worldArchive();
	const archiveId = _digest(bytes);
	const directory = mkdtempSync(join(tmpdir(), "mapshot-verify-world-"));
	_directories.push(directory);
	const rangeRepository = td.object<_Repository>();
	const readRange = rangeRepository.readRange;
	td.when(readRange(td.matchers.anything())).thenDo(
		async ({ offset, length }: Parameters<_Repository["readRange"]>[0]): ReturnType<_Repository["readRange"]> =>
			bytes.subarray(offset, offset + length),
	);
	const result = await new VerifyArchiveService({ archiveRangeService: rangeRepository }).verifyAndExtractLandmarks({
		checkpoint: _checkpoint({
			archive: {
				key: "20261011.pmtiles",
				bytes: bytes.length,
				blake3: archiveId,
				version: "4.15.2",
				observedAt: 1000,
			},
			objectKey: "source/real-world.pmtiles",
			objectEtag: "real-world-etag",
		}),
		workDirectory: directory,
		deadlineAt: Date.now() + 320 * 60_000,
	});
	expect(result.archive.digest).toEqual({ algorithm: "blake3", value: archiveId, verified: true });
	expect(readdirSync(directory)).toEqual(["landmarks.pmtiles"]);
	expect(createHash("sha256").update(readFileSync(result.landmarks.path)).digest("hex")).toBe(result.landmarks.sha256);
	const repository = await LandmarkIndexService.open({
		path: result.landmarks.path,
		reference: {
			key: "source/import/attempts/real-world/1/references/landmarks.pmtiles",
			sha256: result.landmarks.sha256,
			bytes: result.landmarks.bytes,
			archiveId: archiveId,
		},
	});
	try {
		const queried = await repository.query({
			center: { latitude: 85.05, longitude: -179.995 },
			zoom: 13,
			size: { width: 512, height: 512 },
		});
		expect(queried).toHaveLength(1);
		expect(queried[0]).toMatchObject({
			id: "pois:hospital:9007199254740993",
			label: "Hospital",
			kind: "hospital",
		});
	} finally {
		await repository.close();
	}
	const signal = td.explain(readRange).calls[0]!.args[0].signal;
	expect(signal).toBeInstanceOf(AbortSignal);
	expect(
		td
			.explain(readRange)
			.calls.map((call) => call.args)
			.every(([request]) => request.etag === "real-world-etag" && request.signal === signal),
	).toBe(true);
});

it("keeps archive zoom metadata from the source accepted by the extractor", async () => {
	const fixture = _fixture({ minZoom: 1, maxZoom: 16 });
	const result = await fixture.service.verifyAndExtractLandmarks(fixture.input);
	expect(result.archive.minZoom).toBe(1);
	expect(result.archive.maxZoom).toBe(16);
	td.verify(fixture.prepare(td.matchers.anything()));
});

it("leaves storage retries with its range service and preserves a conditional read failure", async () => {
	const fixture = _fixture();
	const failure = new SourceImportError({ code: SourceImportErrorCode.STORAGE });
	td.when(fixture.readRange(td.matchers.anything()), { times: 1 }).thenReject(failure);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toBe(failure);
	expect(td.explain(fixture.readRange).callCount).toBe(1);
	expect(td.explain(fixture.prepare).callCount).toBe(0);
});

it("preserves a failed full scan range and cleans up extraction without finishing", async () => {
	const fixture = _fixture();
	const failure = new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
	td.when(fixture.readRange(td.matchers.anything())).thenDo(
		async ({ length }: Parameters<_Repository["readRange"]>[0]): ReturnType<_Repository["readRange"]> => {
			if (length === 127) return fixture.bytes.slice(0, 127);
			throw failure;
		},
	);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toBe(failure);
	expect(td.explain(fixture.consume).callCount).toBe(0);
	expect(td.explain(fixture.finish).callCount).toBe(0);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
});

it("rejects a mismatched full archive digest before accepting extracted landmarks", async () => {
	const fixture = _fixture();
	fixture.bytes[256] = 1;
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toMatchObject({
		code: SourceImportErrorCode.INTEGRITY,
	});
	expect(td.explain(fixture.consume).callCount).toBe(1);
	expect(td.explain(fixture.finish).callCount).toBe(0);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
});

it("awaits extraction backpressure before reading the next bounded verification range", async () => {
	const partBytes = 64 * 1024 * 1024;
	const fixture = _fixture({ bytes: partBytes + 97 });
	const entered = Promise.withResolvers<void>();
	const proceed = Promise.withResolvers<void>();
	td.when(fixture.consume(td.matchers.anything()), { times: 1 }).thenDo(async (): ReturnType<_Consume> => {
		entered.resolve();
		await proceed.promise;
	});
	const verification = fixture.service.verifyAndExtractLandmarks(fixture.input);
	await entered.promise;
	expect(
		td
			.explain(fixture.readRange)
			.calls.map((call) => call.args)
			.some(([request]) => request.offset === partBytes),
	).toBe(false);
	expect(td.explain(fixture.finish).callCount).toBe(0);
	proceed.resolve();
	await verification;
	expect(
		td
			.explain(fixture.consume)
			.calls.map((call) => call.args)
			.map(([request]) => [request.offset, request.length]),
	).toEqual([
		[0, partBytes],
		[partBytes, 97],
	]);
	expect(td.explain(fixture.finish).callCount).toBe(1);
});

it("releases the extraction session when its first verification range fails", async () => {
	const fixture = _fixture();
	const failure = new SourceImportError({ code: SourceImportErrorCode.STORAGE });
	td.when(fixture.readRange(td.matchers.anything())).thenDo(
		async ({ length }: Parameters<_Repository["readRange"]>[0]): ReturnType<_Repository["readRange"]> => {
			if (length === 127) return fixture.bytes.slice(0, 127);
			throw failure;
		},
	);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toBe(failure);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
	expect(td.explain(fixture.finish).callCount).toBe(0);
});

it("propagates an extraction preparation failure without finishing a missing session", async () => {
	const fixture = _fixture();
	const failure = new ReferenceImportError({ code: ReferenceImportErrorCode.CAPACITY });
	td.when(fixture.prepare(td.matchers.anything()), { times: 1 }).thenReject(failure);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toBe(failure);
	expect(td.explain(fixture.consume).callCount).toBe(0);
	expect(td.explain(fixture.dispose).callCount).toBe(0);
});

it.each(["consume", "finish"] as const)("cleans up its spool after an extraction %s failure", async (operation) => {
	const fixture = _fixture();
	const failure = new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE });
	if (operation === "consume") td.when(fixture.consume(td.matchers.anything()), { times: 1 }).thenReject(failure);
	else td.when(fixture.finish(), { times: 1 }).thenReject(failure);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toBe(failure);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
	expect(existsSync(join(fixture.input.workDirectory, "extraction"))).toBe(false);
	expect(existsSync(join(fixture.input.workDirectory, "landmarks.pmtiles"))).toBe(false);
});

it("still releases the extraction session if retaining its completed landmark file fails", async () => {
	const fixture = _fixture();
	rmSync(fixture.packedPath);
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toMatchObject({ code: "ENOENT" });
	expect(td.explain(fixture.dispose).callCount).toBe(1);
});

it("rejects a checkpoint without an archive ETag before reading storage", async () => {
	const fixture = _fixture();
	fixture.input.checkpoint.objectEtag = null;
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toMatchObject({
		code: SourceImportErrorCode.INTEGRITY,
	});
	td.verify(fixture.readRange(td.matchers.anything()), { times: 0 });
});

it.each([false, true])("verifies the checkpoint object with an existing receipt %s", async (retained) => {
	const fixture = _fixture();
	const source = fixture.input.checkpoint.input.archive;
	const verifiedArchive = {
		id: source.blake3,
		objectKey: fixture.input.checkpoint.objectKey,
		bytes: source.bytes,
		etag: "pinned-etag",
		digest: { algorithm: "blake3", value: source.blake3, verified: true },
		minZoom: 0,
		maxZoom: 15,
		coverage: "complete-planet",
	} satisfies NonNullable<SourceImportCheckpoint["verifiedArchive"]>;
	const checkpoint = {
		schemaVersion: 1,
		id: "a".repeat(64),
		input: { id: "a".repeat(64), archive: source },
		generation: 0,
		stage: "verifying",
		updatedAt: 100,
		objectKey: fixture.input.checkpoint.objectKey,
		uploadId: null,
		sourceEtag: null,
		objectEtag: "pinned-etag",
		verifiedArchive: retained ? verifiedArchive : null,
		packedIndex: null,
		parts: [],
		status: { kind: "running", id: "a".repeat(64), phase: "verifying", updatedAt: 100 },
	} satisfies SourceImportCheckpoint;
	const output = await fixture.service.verifyAndExtractLandmarks({
		checkpoint: checkpoint,
		workDirectory: fixture.input.workDirectory,
		deadlineAt: fixture.input.deadlineAt,
	});
	const expectedKey = fixture.input.checkpoint.objectKey;
	expect(output.archive.objectKey).toBe(expectedKey);
	for (const [request] of td.explain(fixture.readRange).calls.map((call) => call.args))
		expect(request.key).toBe(expectedKey);
});

it("owns the supplied archive verification deadline", async () => {
	const fixture = _fixture();
	const timeout = td.replace(AbortSignal, "timeout");
	await expect(
		fixture.service.verifyAndExtractLandmarks({
			checkpoint: fixture.input.checkpoint,
			workDirectory: fixture.input.workDirectory,
			deadlineAt: Date.now() - 1,
		}),
	).rejects.toMatchObject({ code: SourceImportErrorCode.ABORTED });
	td.verify(timeout(td.matchers.anything()), { times: 0 });
	td.verify(fixture.readRange(td.matchers.anything()), { times: 0 });
});

it("discards extraction output when the verification deadline expires before retaining the completed file", async () => {
	const fixture = _fixture();
	const deadline = _controlledDeadline();
	td.when(fixture.finish(), { times: 1 }).thenDo(async (): ReturnType<_Session["finish"]> => {
		deadline.abort();
		return fixture.output;
	});
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toMatchObject({
		code: SourceImportErrorCode.ABORTED,
	});
	expect(td.explain(fixture.dispose).callCount).toBe(1);
	expect(existsSync(fixture.packedPath)).toBe(false);
	expect(existsSync(join(fixture.input.workDirectory, "landmarks.pmtiles"))).toBe(false);
});

it("stops before fetching another range when the verification deadline expires during extraction", async () => {
	const fixture = _fixture({ bytes: 64 * 1024 * 1024 + 1 });
	const deadline = _controlledDeadline();
	td.when(fixture.consume(td.matchers.anything()), { times: 1 }).thenDo(async (): ReturnType<_Consume> => {
		deadline.abort();
	});
	await expect(fixture.service.verifyAndExtractLandmarks(fixture.input)).rejects.toMatchObject({
		code: SourceImportErrorCode.ABORTED,
	});
	expect(td.explain(fixture.readRange).callCount).toBe(2);
	expect(td.explain(fixture.finish).callCount).toBe(0);
	expect(td.explain(fixture.dispose).callCount).toBe(1);
});
