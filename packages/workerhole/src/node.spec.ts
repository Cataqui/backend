import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { Adapter } from "./adapter.types";
import { createChannel } from "./create-channel";
import { createNodeAdapter } from "./node-adapter";
import { ConnectionClosedError } from "./errors";
import type { CallContext, Channel } from "./types";

const _network = vi.hoisted(() => ({
	address: "",
	closed: 0,
	peerTimeout: undefined as number | undefined,
	socket: undefined as import("ws").WebSocket | undefined,
}));
vi.mock("ws", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ws")>();
	return {
		...actual,
		WebSocket: class extends actual.WebSocket {
			constructor(url: string, options?: import("ws").ClientOptions) {
				super(url.replace("ws://workerhole.internal", _network.address), options);
				_network.socket = this;
				this.once("close", () => {
					_network.closed++;
				});
				this.once("upgrade", (response) => {
					if (_network.peerTimeout !== undefined)
						response.headers["x-workerhole-idle-timeout-ms"] = String(_network.peerTimeout);
				});
			}
		},
	};
});

const _cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of _cleanups.splice(0).reverse()) await cleanup();
});

interface _FixtureApi {
	ping(): number;
	fail(): never;
	wait(context: CallContext): Promise<number>;
}

async function _fixture(options: { idleTimeoutMs?: number; peerTimeoutMs?: number } = {}): Promise<{
	adapter: Adapter;
	portal: Channel<_FixtureApi>;
	receiver: Adapter;
	server: Server;
}> {
	_network.peerTimeout = options.peerTimeoutMs;
	let invocations = 0;
	class Entrypoint {
		readonly expose = {
			ping: (): number => ++invocations,
			fail: (): never => {
				throw new Error("Rejected.");
			},
			wait: async (context: CallContext): Promise<number> =>
				new Promise<number>((_resolve, reject) => {
					context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
				}),
		};
	}
	const server = createServer();
	const receiver = createNodeAdapter({ server: server, expose: new Entrypoint() });
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") throw new TypeError("Fixture requires a TCP listener.");
	_network.address = `ws://127.0.0.1:${address.port}`;
	_cleanups.push(async () => {
		await receiver.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const adapter = createNodeAdapter({
		server: createServer(),
		expose: { expose: {} },
		idleTimeoutMs: options.idleTimeoutMs,
	});
	const portal = createChannel<Entrypoint["expose"]>({
		adapter: adapter,
	});
	_cleanups.push(() => portal.close());
	return {
		adapter: adapter,
		portal: portal,
		receiver: receiver,
		server: server,
	};
}

describe("Node adapter outgoing connections", () => {
	it("initiates calls with an empty local API", async () => {
		const { portal } = await _fixture();
		expect(await portal.ping()).toBe(1);
	});

	it.each([{ idleTimeoutMs: 100 }, { peerTimeoutMs: 100 }, { idleTimeoutMs: 200, peerTimeoutMs: 100 }])(
		"reconnects automatically after the configured idle policy closes its session %j",
		async (options) => {
			const { adapter, portal } = await _fixture(options);
			const previous = _network.closed;
			await portal.ping();
			const first = await adapter.connect();
			await vi.waitFor(() => expect(_network.closed).toBeGreaterThan(previous));
			const second = await adapter.connect();
			expect(second).not.toBe(first);
		},
	);

	it("shares concurrent startup between calls", async () => {
		const { adapter } = await _fixture();
		const connections = await Promise.all([adapter.connect(), adapter.connect()]);
		expect(connections[0]).toBe(connections[1]);
	});

	it("applies the peer idle policy received with an incoming upgrade", async () => {
		await _fixture();
		const socket = new WebSocket(`${_network.address}/internal/workerhole`, {
			headers: { "x-workerhole-idle-timeout-ms": "100" },
		});
		await once(socket, "open");
		await once(socket, "close");
		expect(socket.readyState).toBe(WebSocket.CLOSED);
	});

	it("reuses an open session for subsequent calls", async () => {
		const { adapter } = await _fixture();
		const first = await adapter.connect();
		expect(await adapter.connect()).toBe(first);
	});

	it("reconnects on new demand after the former socket closes", async () => {
		const { adapter } = await _fixture();
		const first = await adapter.connect();
		await first.close();
		const second = await adapter.connect();
		expect(second).not.toBe(first);
	});

	it("rejects new demand after closing", async () => {
		const { adapter } = await _fixture();
		await adapter.close();
		expect(adapter.connect()).rejects.toThrow("connection is closed");
	});

	it("makes repeated shutdown harmless", async () => {
		const { adapter } = await _fixture();
		await adapter.connect();
		await adapter.close();
		expect(adapter.close()).resolves.toBeUndefined();
	});

	it("reports a failed opening handshake as a connection failure", async () => {
		_network.address = "ws://127.0.0.1:1";
		const adapter = createNodeAdapter({ server: createServer(), expose: { expose: {} } });
		_cleanups.push(() => adapter.close());
		expect(adapter.connect()).rejects.toMatchObject({
			name: "ConnectionFailedError",
		});
	});

	it("closes an opening connection and rejects its pending caller during shutdown", async () => {
		const { adapter } = await _fixture();
		const previouslyClosed = _network.closed;
		const pending = adapter.connect().catch((error: unknown) => error);
		await adapter.close();
		expect(await pending).toBeInstanceOf(ConnectionClosedError);
		expect(_network.closed).toBeGreaterThan(previouslyClosed);
	});

	it("rejects pending calls when the receiver shuts down", async () => {
		const { portal, receiver } = await _fixture();
		await portal.ping();
		await receiver.close();
		expect(portal.ping()).rejects.toThrow();
	});

	it("preserves the owned connection error for a pending call when its peer closes", async () => {
		const { portal, receiver } = await _fixture();
		const pending = portal.wait().catch((error: unknown) => error);
		await portal.ping();
		await receiver.close();
		expect(await pending).toBeInstanceOf(ConnectionClosedError);
	});

	it("preserves the original socket error for a pending call", async () => {
		const { portal } = await _fixture();
		const pending = portal.wait().catch((error: unknown) => error);
		await portal.ping();
		const socket = _network.socket;
		if (socket === undefined) throw new TypeError("Fixture requires an open WebSocket.");
		const failure = new Error("Container WebSocket failed.");
		socket.emit("error", failure);
		expect(await pending).toBe(failure);
	});

	it("does not claim unrelated WebSocket upgrade paths", async () => {
		const { server } = await _fixture();
		let handled = false;
		server.on("upgrade", (_request, socket) => {
			handled = true;
			socket.end("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
		});
		const socket = new globalThis.WebSocket(`${_network.address}/other-application`);
		await new Promise<void>((resolve) => socket.addEventListener("error", () => resolve(), { once: true }));
		expect(handled).toBe(true);
	});
});
