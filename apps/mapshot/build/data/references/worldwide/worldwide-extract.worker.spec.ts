import type { MessagePort } from "node:worker_threads";
import * as td from "testdouble";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReferenceImportErrorCode } from "../reference-import-error-code.enum";
import type { WorldwideWorkerResult, WorldwideWorkerTask } from "./worldwide-extraction.protocol";
import { WorldwidePointExtractionService, type WorldwidePointSpoolOutput } from "./worldwide-point-extraction.service";

const _state = vi.hoisted(() => ({ port: null as MessagePort | null }));
vi.mock("node:worker_threads", () => ({
	get parentPort(): MessagePort | null {
		return _state.port;
	},
	workerData: { path: "points.ndjson" },
}));
vi.mock("./worldwide-point-extraction.service.ts", async () => {
	const doubles = await import("testdouble");
	return { WorldwidePointExtractionService: doubles.func<typeof WorldwidePointExtractionService>() };
});

afterEach(() => td.reset());
let _service: WorldwidePointExtractionService;
let _listener: (task: WorldwideWorkerTask) => void;
let _port: MessagePort;
beforeEach(() => {
	vi.resetModules();
	_service = td.object<WorldwidePointExtractionService>();
	_port = td.object<MessagePort>();
	_state.port = _port;
	td.when(new WorldwidePointExtractionService({ path: "points.ndjson" })).thenReturn(_service);
	td.when(_port.on("message", td.matchers.anything())).thenDo(
		(_event: string, listener: (task: WorldwideWorkerTask) => void): MessagePort => {
			_listener = listener;
			return _port;
		},
	);
});

it("passes the batch to extraction and acknowledges the completed operation", async () => {
	const bytes = Uint8Array.of(1, 2).buffer;
	const records = Uint8Array.of(3, 4).buffer;
	await import("./worldwide-extract.worker");
	_listener({ operation: "extract", bytes: bytes, records: records });
	td.verify(new WorldwidePointExtractionService({ path: "points.ndjson" }));
	td.verify(_service.extract({ bytes: bytes, records: records }));
	td.verify(_port.postMessage({ kind: "extracted" } satisfies WorldwideWorkerResult));
	td.verify(_service.close(), { times: 0 });
});

it("posts the completed spool and shared content counts returned by finish", async () => {
	const result = {
		file: { path: "points.ndjson", bytes: 123, lines: 4, sha256: "a".repeat(64) },
		sharedContents: 2,
	} satisfies WorldwidePointSpoolOutput;
	td.when(_service.finish()).thenReturn(result);
	await import("./worldwide-extract.worker");
	_listener({ operation: "finish" });
	td.verify(
		_port.postMessage({
			kind: "finished",
			file: result.file,
			sharedContents: 2,
		} satisfies WorldwideWorkerResult),
	);
	td.verify(_service.close(), { times: 0 });
});

it.each(Object.values(ReferenceImportErrorCode))(
	"retains the %s operation error through the thread result",
	async (code) => {
		const { ReferenceImportError } = await import("../reference-import.error");
		const failure = new ReferenceImportError({ code: code, message: "Extraction failed while writing the spool" });
		td.when(_service.finish()).thenThrow(failure);
		await import("./worldwide-extract.worker");
		_listener({ operation: "finish" });
		td.verify(_service.close(), { times: 1 });
		td.verify(
			_port.postMessage({ kind: "error", code: code, message: failure.message } satisfies WorldwideWorkerResult),
		);
	},
);

it("leaves native I/O errors intact for the worker error event and closes the spool", async () => {
	const failure = Object.assign(new Error("No space left on device"), { code: "ENOSPC" });
	td.when(_service.extract(td.matchers.anything())).thenThrow(failure);
	await import("./worldwide-extract.worker");
	expect(() => _listener({ operation: "extract", bytes: new ArrayBuffer(0), records: new ArrayBuffer(0) })).toThrow(
		failure,
	);
	td.verify(_service.close(), { times: 1 });
	td.verify(_port.postMessage(td.matchers.anything()), { times: 0 });
});

it("requires a parent worker-thread port", async () => {
	_state.port = null;
	await expect(import("./worldwide-extract.worker")).rejects.toThrow("Landmark extraction requires a worker thread");
});
