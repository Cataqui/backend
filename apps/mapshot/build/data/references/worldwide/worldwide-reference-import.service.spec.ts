import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { zxyToTileId } from "pmtiles";
import * as td from "testdouble";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ReferenceImportErrorCode } from "../reference-import-error-code.enum";
import { ReferenceImportError } from "../reference-import.error";
import type { WorldwideWorkerResult, WorldwideWorkerTask } from "./worldwide-extraction.protocol";
import { WorldwideExtractionRepository } from "./worldwide-extraction.repository";
import { WorldwideIndexService, type WorldwideIndexBuildOutput } from "./worldwide-index.service";
import { WorldwidePlanService } from "./worldwide-plan.service";
import { WorldwideReferenceImportService } from "./worldwide-reference-import.service";

type _WorkerFixture = {
	worker: Worker;
	path: string;
	message: (result: WorldwideWorkerResult) => void;
	error: (error: Error) => void;
	exit: (code: number) => void;
};

const _repository = WorldwideExtractionRepository.prototype;
const _workers: _WorkerFixture[] = [];
const _tasks: { worker: Worker; task: WorldwideWorkerTask }[] = [];
let _sharedContents = 0;
let _workerFailure: ReferenceImportError | null = null;
let _automaticReplies = true;
let _memberRecords = Buffer.alloc(0);
let _archiveBytes = 10;
let _finishTasksObserved = Promise.withResolvers<void>();
const _directory = "/work/worldwide-attempt";
const _plan = {
	membersPath: join(_directory, "plan/members.bin"),
	aliasesPath: join(_directory, "plan/aliases.bin"),
} satisfies Awaited<ReturnType<WorldwidePlanService["prepare"]>>;
const _output = {
	path: join(_directory, "packed/landmarks.pmtiles"),
	bytes: 16385,
	sha256: "c".repeat(64),
} satisfies WorldwideIndexBuildOutput;

afterEach(() => td.reset());
beforeEach(() => {
	for (const method of [
		"createAttempt",
		"openMembers",
		"readMembers",
		"closeMembers",
		"removeFile",
		"removeAttempt",
		"createWorker",
		"send",
		"terminate",
	] as const)
		td.replace(_repository, method);
	_workers.length = 0;
	_tasks.length = 0;
	_sharedContents = 0;
	_workerFailure = null;
	_automaticReplies = true;
	_archiveBytes = 10;
	_finishTasksObserved = Promise.withResolvers<void>();
	td.when(_repository.createAttempt({ workDirectory: "/work" })).thenReturn(_directory);
	td.when(_repository.openMembers({ path: _plan.membersPath })).thenReturn(7);
	const records = Buffer.alloc(24);
	records.writeBigUInt64LE(3n);
	records.writeUInt32LE(4, 8);
	records.writeUInt32LE(zxyToTileId(15, 16384, 16384), 12);
	records.writeUInt32LE(1, 16);
	_memberRecords = records;
	let read = false;
	td.when(_repository.readMembers(td.matchers.anything())).thenDo((params: { fd: number; bytes: Buffer }): number => {
		if (read) return 0;
		read = true;
		return _memberRecords.copy(params.bytes);
	});
	td.when(td.replace(WorldwidePlanService.prototype, "prepare")(td.matchers.anything())).thenResolve(_plan);
	td.when(td.replace(WorldwideIndexService.prototype, "build")(td.matchers.anything())).thenResolve(_output);
	td.when(_repository.createWorker(td.matchers.anything())).thenDo((params: { path: string }): Worker => {
		const fixture = {
			worker: td.object<Worker>(),
			path: params.path,
			message: td.func<(result: WorldwideWorkerResult) => void>(),
			error: td.func<(error: Error) => void>(),
			exit: td.func<(code: number) => void>(),
		} satisfies _WorkerFixture;
		td.when(fixture.worker.on("message", td.matchers.anything())).thenDo(
			(_event: string, listener: _WorkerFixture["message"]): Worker => {
				fixture.message = listener;
				return fixture.worker;
			},
		);
		td.when(fixture.worker.on("error", td.matchers.anything())).thenDo(
			(_event: string, listener: _WorkerFixture["error"]): Worker => {
				fixture.error = listener;
				return fixture.worker;
			},
		);
		td.when(fixture.worker.on("exit", td.matchers.anything())).thenDo(
			(_event: string, listener: _WorkerFixture["exit"]): Worker => {
				fixture.exit = listener;
				return fixture.worker;
			},
		);
		_workers.push(fixture);
		return fixture.worker;
	});
	td.when(_repository.terminate(td.matchers.anything())).thenResolve(1);
	td.when(_repository.send(td.matchers.anything())).thenDo(
		(params: { worker: Worker; task: WorldwideWorkerTask }): void => {
			_tasks.push({ worker: params.worker, task: params.task });
			const allWorkersAreFinishing =
				_tasks.filter((entry) => entry.task.operation === "finish").length === _workers.length;
			if (allWorkersAreFinishing) _finishTasksObserved.resolve();
			if (!_automaticReplies) return;
			const fixture = _workers.find((entry) => entry.worker === params.worker);
			assert.ok(fixture);
			if (_workerFailure !== null) {
				fixture.message({ kind: "error", code: _workerFailure.code, message: _workerFailure.message });
				return;
			}
			if (params.task.operation === "finish") {
				fixture.message({
					kind: "finished",
					file: { path: fixture.path, bytes: 0, lines: 0, sha256: "d".repeat(64) },
					sharedContents: _sharedContents,
				});
				return;
			}
			fixture.message({ kind: "extracted" });
		},
	);
});

async function _fixture(): Promise<{
	session: WorldwideReferenceImportService;
	controller: AbortController;
	bytes: Buffer;
}> {
	const controller = new AbortController();
	const bytes = Buffer.from(Array.from({ length: _archiveBytes }, (_, index) => index));
	const session = await WorldwideReferenceImportService.prepare({
		archive: {
			bytes: bytes.length,
			read: td.func<Parameters<WorldwidePlanService["prepare"]>[0]["archive"]["read"]>(),
		},
		workDirectory: "/work",
		signal: controller.signal,
	});
	return { session: session, controller: controller, bytes: bytes };
}

it("plans source extraction, joins split members, drains workers and passes trusted spool receipts to indexing", async () => {
	const fixture = await _fixture();
	expect(_workers).toHaveLength(Math.max(1, Math.min(4, availableParallelism())));
	for (let offset = 0; offset < fixture.bytes.length; offset += 2)
		await fixture.session.consume({ offset: offset, bytes: fixture.bytes.subarray(offset, offset + 2) });
	expect(await fixture.session.finish()).toEqual(_output);
	const extracted = _tasks.find((entry) => entry.task.operation === "extract")?.task;
	assert.ok(extracted?.operation === "extract");
	expect(Buffer.from(extracted.bytes)).toEqual(Buffer.from([3, 4, 5, 6]));
	const records = Buffer.from(extracted.records);
	expect(records.readUInt32LE(0)).toBe(0);
	expect(records.readUInt32LE(4)).toBe(4);
	expect(records.readUInt32LE(8)).toBe(zxyToTileId(15, 16384, 16384));
	expect(records.readUInt32LE(12)).toBe(1);
	expect(records.readBigUInt64LE(16)).toBe(3n);
	td.verify(
		WorldwideIndexService.prototype.build({
			spool: {
				files: _workers.map((worker) => ({ path: worker.path, bytes: 0, lines: 0, sha256: "d".repeat(64) })),
			},
			aliasesPath: null,
			directory: join(_directory, "packed"),
			signal: fixture.controller.signal,
		}),
	);
	td.verify(_repository.closeMembers({ fd: 7 }), { times: 1 });
	td.verify(_repository.removeFile({ path: _plan.membersPath }));
	td.verify(_repository.removeFile({ path: _plan.aliasesPath }));
	for (const worker of _workers) td.verify(_repository.terminate({ worker: worker.worker }), { times: 1 });
	await expect(fixture.session.finish()).rejects.toMatchObject({ code: ReferenceImportErrorCode.CLOSED });
	await fixture.session.dispose();
	td.verify(_repository.removeAttempt({ directory: _directory }));
});

it("passes aliases to indexing when a worker owns shared point contents", async () => {
	const fixture = await _fixture();
	_sharedContents = 1;
	await fixture.session.consume({ offset: 0, bytes: fixture.bytes });
	await fixture.session.finish();
	td.verify(WorldwideIndexService.prototype.build(td.matchers.contains({ aliasesPath: _plan.aliasesPath })));
	td.verify(_repository.removeFile({ path: _plan.aliasesPath }), { times: 0 });
});

it("rejects noncontiguous source chunks, source overruns and incomplete streams", async () => {
	const fixture = await _fixture();
	await expect(fixture.session.consume({ offset: 1, bytes: fixture.bytes })).rejects.toMatchObject({
		code: ReferenceImportErrorCode.INTEGRITY,
	});
	await expect(
		fixture.session.consume({ offset: 0, bytes: Buffer.alloc(fixture.bytes.length + 1) }),
	).rejects.toMatchObject({ code: ReferenceImportErrorCode.INTEGRITY });
	await expect(fixture.session.finish()).rejects.toMatchObject({ code: ReferenceImportErrorCode.INCOMPLETE });
	await fixture.session.consume({ offset: 0, bytes: fixture.bytes.subarray(0, 5) });
	await expect(fixture.session.finish()).rejects.toMatchObject({ code: ReferenceImportErrorCode.INCOMPLETE });
	await fixture.session.dispose();
});

it("propagates caller cancellation and removes only its owned attempt after draining workers", async () => {
	const fixture = await _fixture();
	const reason = new Error("Stopped verification");
	fixture.controller.abort(reason);
	await expect(fixture.session.consume({ offset: 0, bytes: fixture.bytes })).rejects.toBe(reason);
	await fixture.session.dispose();
	td.verify(_repository.removeAttempt({ directory: _directory }));
	for (const worker of _workers) td.verify(_repository.terminate({ worker: worker.worker }));
});

it("discards its attempt when plan preparation fails", async () => {
	const failure = new Error("Invalid source directory");
	td.when(WorldwidePlanService.prototype.prepare(td.matchers.anything())).thenReject(failure);
	await expect(_fixture()).rejects.toBe(failure);
	td.verify(_repository.removeAttempt({ directory: _directory }));
});

it("preserves worker system failures through the subsequent exit event", async () => {
	const fixture = await _fixture();
	const failure = Object.assign(new Error("Disk is full"), { code: "ENOSPC" });
	const worker = _workers[0]!;
	worker.error(failure);
	worker.exit(1);
	await expect(fixture.session.consume({ offset: 0, bytes: fixture.bytes })).rejects.toBe(failure);
	await fixture.session.dispose();
});

it("reports an unexpected worker exit as a worker lifecycle failure", async () => {
	const fixture = await _fixture();
	_workers[0]!.exit(1);
	await expect(fixture.session.consume({ offset: 0, bytes: fixture.bytes })).rejects.toMatchObject({
		code: ReferenceImportErrorCode.WORKER_EXITED,
	});
	await fixture.session.dispose();
});

it("preserves an owned extraction error's code and message", async () => {
	const fixture = await _fixture();
	const failure = new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE, message: "Invalid MVT" });
	_workerFailure = failure;
	await fixture.session.consume({ offset: 0, bytes: fixture.bytes });
	await expect(fixture.session.finish()).rejects.toMatchObject({ code: failure.code, message: failure.message });
	await fixture.session.dispose();
});

it("unblocks a saturated worker pool on caller cancellation and drains every pending task", async () => {
	const workers = Math.max(1, Math.min(4, availableParallelism()));
	_memberRecords = Buffer.alloc((workers + 1) * 24);
	for (let index = 0; index <= workers; index++) {
		_memberRecords.writeBigUInt64LE(BigInt(index * 4), index * 24);
		_memberRecords.writeUInt32LE(4, index * 24 + 8);
		_memberRecords.writeUInt32LE(zxyToTileId(15, index, 0), index * 24 + 12);
		_memberRecords.writeUInt32LE(1, index * 24 + 16);
	}
	_archiveBytes = (workers + 1) * 4;
	_automaticReplies = false;
	const fixture = await _fixture();
	for (let index = 0; index < workers; index++)
		await fixture.session.consume({ offset: index * 4, bytes: fixture.bytes.subarray(index * 4, index * 4 + 4) });
	const pending = fixture.session.consume({ offset: workers * 4, bytes: fixture.bytes.subarray(workers * 4) });
	expect(_tasks).toHaveLength(workers);
	const reason = new Error("Cancelled while all extraction workers were busy");
	fixture.controller.abort(reason);
	await expect(pending).rejects.toBe(reason);
	await Promise.all([fixture.session.dispose(), fixture.session.dispose()]);
	for (const worker of _workers) td.verify(_repository.terminate({ worker: worker.worker }), { times: 1 });
	td.verify(_repository.closeMembers({ fd: 7 }), { times: 1 });
});

it("unblocks caller cancellation while draining extraction results", async () => {
	_automaticReplies = false;
	const fixture = await _fixture();
	await fixture.session.consume({ offset: 0, bytes: fixture.bytes });
	const finishing = fixture.session.finish();
	const reason = new Error("Cancelled while draining extraction");
	fixture.controller.abort(reason);
	await expect(finishing).rejects.toBe(reason);
	await fixture.session.dispose();
	for (const worker of _workers) td.verify(_repository.terminate({ worker: worker.worker }), { times: 1 });
});

it("unblocks caller cancellation while waiting for workers to finish their spools", async () => {
	const fixture = await _fixture();
	await fixture.session.consume({ offset: 0, bytes: fixture.bytes });
	_automaticReplies = false;
	const finishing = fixture.session.finish();
	await _finishTasksObserved.promise;
	const reason = new Error("Cancelled while workers flush spools");
	fixture.controller.abort(reason);
	await expect(finishing).rejects.toBe(reason);
	await fixture.session.dispose();
	for (const worker of _workers) td.verify(_repository.terminate({ worker: worker.worker }), { times: 1 });
});
