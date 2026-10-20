import type { ConnectToContainerOptions, Contract } from "./connection.types";
import { createChannel } from "./create-channel";
import type { Definition } from "./definition";
import { validateIdleTimeout } from "./idle-session";
import type { Channel } from "./types";
import { createWorkerAdapter } from "./worker-adapter";

export * from "./public";
export { unsupportedContainerToWorker as connectContainerToWorker } from "./unsupported";

export function connectWorkerToContainer<Remote extends Contract<Remote>>(
	_definition: Definition<Remote, "container">,
	options: ConnectToContainerOptions,
): Channel<Remote> {
	validateIdleTimeout(options.idleTimeoutMs);
	// Native loopback bindings are keyed by the Worker's exported class name.
	const expose = Reflect.get(options.context.exports, options.expose.name) as
		| Parameters<typeof createWorkerAdapter>[0]["expose"]
		| undefined;
	if (expose === undefined) throw new TypeError("Workerhole portal must be exported using its class name.");
	return createChannel<Remote>({
		adapter: createWorkerAdapter({
			context: options.context,
			container: options.context.container as Container | undefined,
			idleTimeoutMs: options.idleTimeoutMs,
			expose: expose,
		}),
	});
}
