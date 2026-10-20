import { WorkerEntrypoint } from "cloudflare:workers";
import { newWebSocketRpcSession, newWorkersWebSocketRpcResponse } from "capnweb";
import type { Adapter } from "./adapter.types";
import { Address } from "./address";
import type { Definition, DefinitionShape, Handlers } from "./definition";
import { type Call, Dispatcher, type Invocation } from "./dispatcher";
import { ConnectionClosedError, PortalUnavailableError } from "./errors";
import type { Session } from "./session.types";

export abstract class WorkerPortal<
	Environment = unknown,
	Portal extends DefinitionShape = Definition<object, "worker">,
> extends WorkerEntrypoint<Environment, _WorkerEntrypointProps> {
	abstract readonly expose: Handlers<Portal>;

	override fetch(request: Request): Response {
		if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 404 });
		const response = newWorkersWebSocketRpcResponse(request, new Dispatcher({ api: this.expose }));
		const timeout = this.ctx.props?.idleTimeoutMs;
		if (timeout !== undefined) response.headers.set(Address.idleTimeoutHeader, String(timeout));
		return response;
	}

	start(invocation: Invocation): Call {
		return new Dispatcher({ api: this.expose }).start(invocation);
	}
}

interface _WorkerEntrypointProps {
	idleTimeoutMs?: number | undefined;
}

interface _WorkerEntrypointBinding extends _WorkerBinding {
	(options: { props: _WorkerEntrypointProps }): _WorkerBinding;
}

interface _WorkerBinding extends Fetcher {
	start(invocation: Invocation): Promise<unknown>;
}

export function createWorkerAdapter(params: {
	context: Pick<DurableObjectState, "blockConcurrencyWhile">;
	container: Container | undefined;
	expose: _WorkerEntrypointBinding;
	idleTimeoutMs?: number | undefined;
}): Adapter {
	if (params.container === undefined) throw new TypeError("Worker portal requires a container-enabled Durable Object.");
	const container = params.container;
	let closed = false;
	let connecting: Promise<Session> | undefined;
	let current: Session | undefined;
	const expose =
		params.idleTimeoutMs === undefined
			? params.expose
			: params.expose({ props: { idleTimeoutMs: params.idleTimeoutMs } });
	const registered = params.context.blockConcurrencyWhile(() => container.interceptOutboundHttp(Address.host, expose));
	// The constructor gate and connect() both observe registration failures.
	void registered.catch(() => undefined);
	return {
		async connect(): Promise<Session> {
			if (closed) throw new ConnectionClosedError();
			if (current !== undefined) return current;
			if (connecting !== undefined) return connecting;
			const operation = (async (): Promise<Session> => {
				await registered;
				if (closed) throw new ConnectionClosedError();
				const response = await container.getTcpPort(Address.port).fetch(`http://container${Address.path}`, {
					headers: {
						upgrade: "websocket",
						...(params.idleTimeoutMs === undefined
							? {}
							: {
									[Address.idleTimeoutHeader]: String(params.idleTimeoutMs),
								}),
					},
				});
				const socket = response.webSocket;
				if (socket === null || socket === undefined) {
					await response.body?.cancel();
					throw new PortalUnavailableError();
				}
				socket.accept();
				if (closed) {
					socket.close();
					throw new ConnectionClosedError();
				}
				const remote = newWebSocketRpcSession<Dispatcher>(socket, expose);
				const session: Session = {
					remote: remote,
					async close(): Promise<void> {
						remote[Symbol.dispose]();
						socket.close();
					},
				};
				socket.addEventListener(
					"close",
					() => {
						const closedSessionIsCurrent = current === session;
						if (closedSessionIsCurrent) current = undefined;
					},
					{ once: true },
				);
				current = session;
				return session;
			})();
			connecting = operation;
			try {
				return await operation;
			} finally {
				connecting = undefined;
			}
		},
		async close(): Promise<void> {
			if (closed) return;
			closed = true;
			await current?.close();
			current = undefined;
		},
	};
}
