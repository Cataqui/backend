import type { Definition } from "./definition";
import type { ConnectToWorkerOptions, Contract, ConnectToContainerOptions } from "./connection.types";
import type { Channel } from "./types";

export function unsupportedContainerToWorker<Remote extends Contract<Remote>>(
	_definition: Definition<Remote, "worker">,
	_options: ConnectToWorkerOptions,
): Promise<Channel<Remote>> {
	throw new TypeError("Container-to-Worker connections require a container runtime with Node-compatible APIs.");
}

export function unsupportedWorkerToContainer<Remote extends Contract<Remote>>(
	_definition: Definition<Remote, "container">,
	_options: ConnectToContainerOptions,
): Channel<Remote> {
	throw new TypeError("Worker-to-container connections must be created in Cloudflare Workers.");
}
