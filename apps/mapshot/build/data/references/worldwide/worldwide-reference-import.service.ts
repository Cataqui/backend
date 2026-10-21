import { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { raceWithSignal } from "@cataqui/async";
import { ReferenceImportError } from "../reference-import.error";
import type { WorldwideWorkerResult, WorldwideWorkerTask } from "./worldwide-extraction.protocol";
import { WorldwideExtractionRepository } from "./worldwide-extraction.repository";
import { WorldwideIndexService } from "./worldwide-index.service";
import { WorldwidePlanService } from "./worldwide-plan.service";

type _WorkerEntry = {
	worker: Worker;
	pending: { resolve: (result: WorldwideWorkerResult) => void; reject: (error: Error) => void } | null;
};
type _Member = { offset: number; length: number; tileId: number; multiplicity: number };
type _Archive = {
	bytes: number;
	read: (params: { offset: number; length: number }) => Promise<Uint8Array>;
};
export type WorldwideReferenceImportResult = Awaited<ReturnType<WorldwideIndexService["build"]>>;

// Each attempt owns its plan and spool; failed verification discards both.
export class WorldwideReferenceImportService {
	private readonly _workers: _WorkerEntry[] = [];
	private readonly _running = new Set<Promise<unknown>>();
	private readonly _records = Buffer.alloc(24 * 65_536);
	private _recordBytes = 0;
	private _recordAt = 0;
	private _fd = -1;
	private _error: Error | null = null;
	private _closing: Promise<void> | null = null;
	private _consumed = 0;
	private _next: _Member | null = null;
	private _pieces: Uint8Array[] = [];
	private _pieceBytes = 0;
	private _batch: Uint8Array[] = [];
	private _batchRecords: Buffer[] = [];
	private _batchBytes = 0;

	private constructor(
		private readonly _input: {
			archiveBytes: number;
			directory: string;
			plan: Awaited<ReturnType<WorldwidePlanService["prepare"]>>;
			signal: AbortSignal;
			repository: WorldwideExtractionRepository;
		},
	) {}

	static async prepare(params: {
		archive: _Archive;
		workDirectory: string;
		signal: AbortSignal;
	}): Promise<WorldwideReferenceImportService> {
		params.signal.throwIfAborted();
		const repository = new WorldwideExtractionRepository();
		const directory = repository.createAttempt({ workDirectory: params.workDirectory });
		let session: WorldwideReferenceImportService | null = null;
		try {
			const plan = await new WorldwidePlanService().prepare({
				archive: { bytes: params.archive.bytes, read: params.archive.read },
				directory: join(directory, "plan"),
				signal: params.signal,
			});
			session = new WorldwideReferenceImportService({
				archiveBytes: params.archive.bytes,
				directory: directory,
				plan: plan,
				signal: params.signal,
				repository: repository,
			});
			session._fd = repository.openMembers({ path: plan.membersPath });
			session._next = session._member();
			const activeSession = session;
			for (let index = 0; index < Math.max(1, Math.min(4, availableParallelism())); index += 1) {
				const worker = session._input.repository.createWorker({
					path: join(session._input.directory, `points-${index}.ndjson`),
				});
				const entry: _WorkerEntry = { worker: worker, pending: null };
				worker.on("message", (result: WorldwideWorkerResult) => {
					const pending = entry.pending;
					entry.pending = null;
					if (pending === null) return;
					if (result.kind === "error")
						pending.reject(new ReferenceImportError({ code: result.code, message: result.message }));
					else pending.resolve(result);
				});
				worker.on("error", (error: Error) => {
					activeSession._error = error;
					entry.pending?.reject(activeSession._error);
					entry.pending = null;
				});
				worker.on("exit", (code: number) => {
					if (activeSession._closing !== null) return;
					activeSession._error ??= new ReferenceImportError({
						code: ReferenceImportErrorCode.WORKER_EXITED,
						message: `Landmark extraction worker exited before completion with status ${code}`,
					});
					entry.pending?.reject(activeSession._error);
					entry.pending = null;
				});
				session._workers.push(entry);
			}
			return session;
		} catch (error) {
			if (session !== null) await session.dispose();
			else repository.removeAttempt({ directory: directory });
			throw error;
		}
	}

	async consume(params: { offset: number; bytes: Uint8Array }): Promise<void> {
		this._guard();
		const invalidSourceChunk =
			params.offset !== this._consumed || params.offset + params.bytes.length > this._input.archiveBytes;
		if (invalidSourceChunk) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
		const end = params.offset + params.bytes.length;
		while (this._next !== null && this._next.offset < end) {
			const member = this._next;
			const start = Math.max(params.offset, member.offset);
			const stop = Math.min(end, member.offset + member.length);
			if (stop > start) {
				this._pieces.push(params.bytes.subarray(start - params.offset, stop - params.offset));
				this._pieceBytes += stop - start;
			}
			if (end < member.offset + member.length) break;
			const batchNeedsDispatch = this._batchBytes + member.length > 4 * 1024 * 1024;
			if (batchNeedsDispatch) await this._dispatch();
			const body = Buffer.concat(this._pieces, this._pieceBytes);
			const record = Buffer.alloc(24);
			record.writeUInt32LE(this._batchBytes, 0);
			record.writeUInt32LE(member.length, 4);
			record.writeUInt32LE(member.tileId, 8);
			record.writeUInt32LE(member.multiplicity, 12);
			record.writeBigUInt64LE(BigInt(member.offset), 16);
			this._batch.push(body);
			this._batchRecords.push(record);
			this._batchBytes += member.length;
			this._pieces = [];
			this._pieceBytes = 0;
			this._next = this._member();
		}
		// Submit before releasing this source chunk. The bounded pool naturally
		// slows the verification reader when decode CPU is the limiting stage.
		await this._dispatch();
		this._consumed = end;
	}

	async finish(): Promise<WorldwideReferenceImportResult> {
		this._guard();
		const sourceIsIncomplete = this._consumed !== this._input.archiveBytes || this._next !== null;
		if (sourceIsIncomplete) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE });
		await this._dispatch();
		await raceWithSignal(() => Promise.all(this._running), { signal: this._input.signal });
		this._guard();
		const results = await raceWithSignal(
			() => Promise.all(this._workers.map((entry) => this._send({ entry: entry, task: { operation: "finish" } }))),
			{ signal: this._input.signal },
		);
		await this._close();
		// The physical plan is no longer needed while SQLite canonicalizes rows.
		this._input.repository.removeFile({ path: this._input.plan.membersPath });
		const files = results.map((result) => result.file);
		const sharedContents = results.reduce((sum, result) => sum + result.sharedContents, 0);
		// Empty shared map contents need no geographic landmark alias expansion.
		// Their address multiplicities were already certified by the source plan.
		if (sharedContents === 0) this._input.repository.removeFile({ path: this._input.plan.aliasesPath });
		return new WorldwideIndexService().build({
			spool: {
				files: files,
			},
			aliasesPath: sharedContents === 0 ? null : this._input.plan.aliasesPath,
			directory: join(this._input.directory, "packed"),
			signal: this._input.signal,
		});
	}

	async dispose(): Promise<void> {
		await this._close();
		this._input.repository.removeAttempt({ directory: this._input.directory });
	}

	private _guard(): void {
		this._input.signal.throwIfAborted();
		if (this._error !== null) throw this._error;
		if (this._closing !== null) throw new ReferenceImportError({ code: ReferenceImportErrorCode.CLOSED });
	}
	private _member(): _Member | null {
		if (this._recordAt === this._recordBytes) {
			this._recordBytes = this._input.repository.readMembers({ fd: this._fd, bytes: this._records });
			this._recordAt = 0;
			if (this._recordBytes % 24 !== 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
			if (this._recordBytes === 0) return null;
		}
		const at = this._recordAt;
		this._recordAt += 24;
		return {
			offset: Number(this._records.readBigUInt64LE(at)),
			length: this._records.readUInt32LE(at + 8),
			tileId: this._records.readUInt32LE(at + 12),
			multiplicity: this._records.readUInt32LE(at + 16),
		};
	}
	private _send(params: {
		entry: _WorkerEntry;
		task: Extract<WorldwideWorkerTask, { operation: "finish" }>;
	}): Promise<Extract<WorldwideWorkerResult, { kind: "finished" }>>;
	private _send(params: {
		entry: _WorkerEntry;
		task: Extract<WorldwideWorkerTask, { operation: "extract" }>;
	}): Promise<Extract<WorldwideWorkerResult, { kind: "extracted" }>>;
	private _send(params: { entry: _WorkerEntry; task: WorldwideWorkerTask }): Promise<WorldwideWorkerResult> {
		const entry = params.entry;
		const task = params.task;
		return new Promise((resolve, reject) => {
			entry.pending = { resolve: resolve, reject: reject };
			this._input.repository.send({ worker: entry.worker, task: task });
		});
	}
	private async _dispatch(): Promise<void> {
		if (this._batchBytes === 0) return;
		while (this._running.size >= this._workers.length) {
			await raceWithSignal(() => Promise.race(this._running), { signal: this._input.signal });
			this._guard();
		}
		const entry = this._workers.find((candidate) => candidate.pending === null)!;
		const bytes = Uint8Array.from(Buffer.concat(this._batch, this._batchBytes)).buffer;
		const records = Uint8Array.from(Buffer.concat(this._batchRecords)).buffer;
		this._batch = [];
		this._batchRecords = [];
		this._batchBytes = 0;
		const pending = this._send({ entry: entry, task: { operation: "extract", bytes: bytes, records: records } })
			.catch((error: unknown) => {
				this._error =
					error instanceof Error ? error : new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
			})
			.finally(() => {
				this._running.delete(pending);
			});
		this._running.add(pending);
	}
	private _close(): Promise<void> {
		if (this._closing !== null) return this._closing;
		if (this._fd >= 0) {
			this._input.repository.closeMembers({ fd: this._fd });
			this._fd = -1;
		}
		for (const entry of this._workers) {
			entry.pending?.reject(new ReferenceImportError({ code: ReferenceImportErrorCode.CLOSED }));
			entry.pending = null;
		}
		this._closing = Promise.all(
			this._workers.map((entry) => this._input.repository.terminate({ worker: entry.worker })),
		).then(async (): Promise<void> => {
			await Promise.all(this._running);
		});
		return this._closing;
	}
}
