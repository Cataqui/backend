import { closeSync, mkdirSync, mkdtempSync, openSync, readSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { WorldwideWorkerTask } from "./worldwide-extraction.protocol";

export class WorldwideExtractionRepository {
	createAttempt(params: { workDirectory: string }): string {
		mkdirSync(params.workDirectory, { recursive: true });
		return mkdtempSync(join(params.workDirectory, "worldwide-"));
	}

	openMembers(params: { path: string }): number {
		return openSync(params.path, "r");
	}

	readMembers(params: { fd: number; bytes: Buffer }): number {
		return readSync(params.fd, params.bytes);
	}

	closeMembers(params: { fd: number }): void {
		closeSync(params.fd);
	}

	removeFile(params: { path: string }): void {
		rmSync(params.path);
	}

	removeAttempt(params: { directory: string }): void {
		rmSync(params.directory, { recursive: true, force: true });
	}

	createWorker(params: { path: string }): Worker {
		return new Worker(
			new URL(
				import.meta.url.endsWith(".ts") ? "./worldwide-extract.worker.ts" : "./worldwide-extract.worker.mjs",
				import.meta.url,
			),
			{ workerData: { path: params.path } },
		);
	}

	send(params: { worker: Worker; task: WorldwideWorkerTask }): void {
		params.worker.postMessage(
			params.task,
			params.task.operation === "extract" ? [params.task.bytes, params.task.records] : [],
		);
	}

	terminate(params: { worker: Worker }): Promise<number> {
		return params.worker.terminate();
	}
}
