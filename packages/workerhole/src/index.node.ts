import { createServer } from "node:http";
import { Address } from "./address";
import type { ConnectToWorkerOptions, Contract } from "./connection.types";
import { createChannel } from "./create-channel";
import type { Definition } from "./definition";
import { validateIdleTimeout } from "./idle-session";
import { createNodeAdapter } from "./node-adapter";
import type { Channel } from "./types";

export * from "./public";
export { unsupportedWorkerToContainer as connectWorkerToContainer } from "./unsupported";

export async function connectContainerToWorker<Remote extends Contract<Remote>>(
	_definition: Definition<Remote, "worker">,
	options: ConnectToWorkerOptions,
): Promise<Channel<Remote>> {
	validateIdleTimeout(options.idleTimeoutMs);
	const server = createServer((_request, response) => {
		response.writeHead(404);
		response.end();
	});
	const adapter = createNodeAdapter({
		server: server,
		expose: options.expose,
		idleTimeoutMs: options.idleTimeoutMs,
	});
	let listening = false;
	try {
		const client = createChannel<Remote>({
			adapter: {
				...adapter,
				async close(): Promise<void> {
					await adapter.close();
					await new Promise<void>((resolve, reject) => {
						server.close((error) => (error === undefined ? resolve() : reject(error)));
					});
				},
			},
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(Address.port, "0.0.0.0", () => {
				server.off("error", reject);
				resolve();
			});
		});
		listening = true;
		return client;
	} finally {
		if (!listening) await adapter.close();
	}
}
