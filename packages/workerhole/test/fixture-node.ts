import { createServer } from "node:http";

import type { Handlers } from "@cataqui/workerhole";
import { connectContainerToWorker } from "@cataqui/workerhole";
import { ContainerApi, WorkerApi } from "./fixture-api";

let first = process.env["WORKERHOLE_NODE_FIRST"] === "false" ? "worker-first" : "pending";
let aborted = 0;
class FixtureNode {
	readonly expose: Handlers<typeof ContainerApi> = {
		render: async (input) => ({ bytes: new Uint8Array(input.size).fill(137) }),
		reverse: async () => {
			const body = await portal.resource();
			const reader = body.getReader();
			let bytes = 0;
			try {
				for (;;) {
					const chunk = await reader.read();
					if (chunk.done) return bytes;
					bytes += chunk.value.byteLength;
				}
			} finally {
				await reader.cancel();
				reader.releaseLock();
			}
		},
		stall: async (_input, context) =>
			new Promise<void>((_resolve, reject) => {
				context.signal.addEventListener(
					"abort",
					() => {
						aborted++;
						reject(context.signal.reason);
					},
					{ once: true },
				);
			}),
		aborted: () => aborted,
	};
}
const server = createServer((_request, response) => response.end(first));
const portal = await connectContainerToWorker(WorkerApi, { expose: new FixtureNode() });
server.listen(8080, "0.0.0.0", () => {
	if (first === "worker-first") return;
	void portal
		.withOptions({ timeoutMs: 10_000 })
		.greet({ message: "node-first" })
		.then(
			(value) => {
				first = value;
			},
			(error: unknown) => {
				first = String(error);
			},
		);
});
process.once("SIGTERM", () => {
	void portal.close().then(() => server.close());
});
