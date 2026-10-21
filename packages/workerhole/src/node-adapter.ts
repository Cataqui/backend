import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { RpcSession, WebSocketTransport } from "capnweb";
import { WebSocket, WebSocketServer } from "ws";
import type { Adapter } from "./adapter.types";
import { Address } from "./address";
import { Dispatcher } from "./dispatcher";
import { ConnectionClosedError, ConnectionFailedError } from "./errors";
import { IdleSession } from "./idle-session";
import type { Session } from "./session.types";

export function createNodeAdapter(params: {
	server: Server;
	expose: { readonly expose: object };
	idleTimeoutMs?: number | undefined;
}): Adapter {
	let closed = false;
	let connecting: Promise<Session> | undefined;
	let current: Session | undefined;
	const sockets = new Set<WebSocket>();
	const receiver = new WebSocketServer({ noServer: true });
	const register = (socket: WebSocket, peerTimeoutMs: number | undefined): Session => {
		const idle = new IdleSession({
			timeoutMs:
				params.idleTimeoutMs === undefined ? peerTimeoutMs : Math.min(params.idleTimeoutMs, peerTimeoutMs ?? Infinity),
			close: (): void => {
				const idleSessionIsCurrent = current === session;
				if (idleSessionIsCurrent) current = undefined;
				socket.close();
			},
		});
		const acquire = (): (() => void) => idle.acquire();
		const dispatcher = new Dispatcher({
			api: params.expose.expose,
			acquire: acquire,
		});
		sockets.add(socket);
		socket.once("close", () => {
			sockets.delete(socket);
			idle.close();
			const closedSessionIsCurrent = current === session;
			if (closedSessionIsCurrent) current = undefined;
		});
		const session: Session = {
			remote: new RpcSession<Dispatcher>(new _NodeTransport(socket), dispatcher).getRemoteMain(),
			acquire: acquire,
			close: () => _close(socket),
		};
		return session;
	};
	// Register only our path; leave other applications' upgrade listeners intact.
	const accept = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
		if (request.url !== Address.path) return;
		if (closed) {
			socket.destroy();
			return;
		}
		receiver.handleUpgrade(request, socket, head, (webSocket) => {
			const timeout = request.headers[Address.idleTimeoutHeader];
			const session = register(webSocket, timeout === undefined ? undefined : Number(timeout));
			current ??= session;
		});
	};
	params.server.on("upgrade", accept);
	return {
		async connect(): Promise<Session> {
			if (closed) throw new ConnectionClosedError();
			if (current !== undefined) return current;
			if (connecting !== undefined) return connecting;
			const operation = new Promise<Session>((resolve, reject) => {
				const socket = new WebSocket(`ws://${Address.host}${Address.path}`);
				let peerTimeoutMs: number | undefined;
				socket.once("upgrade", (response) => {
					const timeout = response.headers[Address.idleTimeoutHeader];
					peerTimeoutMs = timeout === undefined ? undefined : Number(timeout);
				});
				sockets.add(socket);
				const failed = (cause: Error): void => {
					sockets.delete(socket);
					reject(closed ? new ConnectionClosedError() : new ConnectionFailedError({ cause: cause }));
				};
				const closedBeforeOpen = (): void => failed(new ConnectionClosedError());
				socket.once("error", failed);
				socket.once("close", closedBeforeOpen);
				socket.once("open", () => {
					socket.off("error", failed);
					socket.off("close", closedBeforeOpen);
					if (closed) {
						socket.close();
						reject(new ConnectionClosedError());
						return;
					}
					current = register(socket, peerTimeoutMs);
					resolve(current);
				});
			});
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
			params.server.off("upgrade", accept);
			await Promise.all([...sockets].map(_close));
			await new Promise<void>((resolve, reject) => {
				receiver.close((error) => (error === undefined ? resolve() : reject(error)));
			});
		},
	};
}

class _NodeTransport extends WebSocketTransport {
	private _failure: Error | undefined;

	constructor(socket: WebSocket) {
		// ws implements the standard events, send, and close methods used by Cap'n Web.
		super(socket as unknown as globalThis.WebSocket);
		socket.once("close", () => {
			this._failure ??= new ConnectionClosedError();
		});
		socket.once("error", (error) => {
			this._failure ??= error;
		});
	}

	override send(message: string): void {
		if (this._failure !== undefined) throw this._failure;
		super.send(message);
	}

	override async receive(): Promise<string> {
		if (this._failure !== undefined) throw this._failure;
		try {
			return await super.receive();
		} catch (error) {
			throw this._failure ?? error;
		}
	}
}

async function _close(socket: WebSocket): Promise<void> {
	if (socket.readyState === WebSocket.CLOSED) return;
	await new Promise<void>((resolve) => {
		socket.once("close", resolve);
		// Termination also handles a session still waiting for its opening handshake.
		socket.on("error", () => undefined);
		socket.terminate();
	});
}
