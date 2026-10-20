import { parentPort, workerData } from "node:worker_threads";
import { ReferenceImportError } from "../reference-import.error.ts";
import type { WorldwideWorkerResult, WorldwideWorkerTask } from "./worldwide-extraction.protocol.ts";
import { WorldwidePointExtractionService } from "./worldwide-point-extraction.service.ts";
if (parentPort === null) throw new TypeError("Landmark extraction requires a worker thread");
const port = parentPort;
const input: { path: string } = workerData;
const service = new WorldwidePointExtractionService({ path: input.path });
port.on("message", (task: WorldwideWorkerTask) => {
	try {
		if (task.operation === "finish") {
			const result = service.finish();
			port.postMessage({
				kind: "finished",
				file: result.file,
				sharedContents: result.sharedContents,
			} satisfies WorldwideWorkerResult);
			return;
		}
		service.extract({ bytes: task.bytes, records: task.records });
		port.postMessage({
			kind: "extracted",
		} satisfies WorldwideWorkerResult);
	} catch (error) {
		service.close();
		if (!(error instanceof ReferenceImportError)) throw error;
		port.postMessage({
			kind: "error",
			code: error.code,
			message: error.message,
		} satisfies WorldwideWorkerResult);
	}
});
