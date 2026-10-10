import { WorkerManifest } from "./worker-manifest";
import type { WorkerCallParameters, WorkerCallInput, WorkerCallResult } from "./worker-call.types";
import { readOutboundJson } from "./read-outbound-json";

export function workerCall<
	const Worker extends keyof typeof WorkerManifest,
	const Method extends keyof (typeof WorkerManifest)[Worker]["methods"],
>(params: {
	worker: Worker;
	method: Method;
	input: NoInfer<WorkerCallInput<typeof WorkerManifest, Worker, Method>>;
	signal?: AbortSignal;
}): Promise<WorkerCallResult<typeof WorkerManifest, Worker, Method>>;
export async function workerCall(params: WorkerCallParameters<typeof WorkerManifest>): Promise<unknown> {
	const worker = Object.entries(WorkerManifest).find(([name]) => name === params.worker)?.[1];
	if (worker === undefined) throw new Error("Worker unavailable");
	const method = Object.entries(worker.methods).find(([name]) => name === params.method)?.[1];
	if (method === undefined) throw new Error("Worker method unavailable");
	method.input.parse(params.input);
	const response = await fetch(`http://${worker.host}/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ method: params.method, input: params.input }),
		signal: params.signal ?? AbortSignal.timeout(45_000),
		redirect: "error",
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error("Worker call unavailable");
	}
	return method.result.parse(await readOutboundJson({ stream: response.body, maxBytes: 16_384 }));
}
