import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { newWebSocketRpcSession } from "capnweb";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannel } from "./create-channel";
import { createNodeAdapter } from "./node-adapter";
import { Dispatcher } from "./dispatcher";
import type { Session } from "./session.types";
import { Address } from "./address";
import type { Adapter } from "./adapter.types";
import type { CallContext, Channel } from "./types";
import { RemoteError } from "./errors";

const _cleanups: (() => Promise<void>)[] = [];
afterEach(() => td.reset());
afterEach(async () => {
	for (const cleanup of _cleanups.splice(0).reverse()) await cleanup();
});

async function _fixture<Api extends object, RemoteApi extends object = object>(
	api: Api,
	options: { idleTimeoutMs?: number; remote?: RemoteApi } = {},
): Promise<{
	portal: Channel<Api>;
	containerPortal: Channel<RemoteApi>;
	socket: WebSocket;
	port: number;
	connection: Session;
}> {
	const server = createServer((_request, response) => response.end("ordinary http"));
	class Entrypoint {
		readonly expose = api;
	}
	const node = createNodeAdapter({ server: server, expose: new Entrypoint(), idleTimeoutMs: options.idleTimeoutMs });
	const containerPortal = createChannel<RemoteApi>({ adapter: node });
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") throw new TypeError("Test server did not bind TCP.");
	_cleanups.push(async () => {
		await node.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const socket = new WebSocket(`ws://127.0.0.1:${address.port}${Address.path}`);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("Fixture WebSocket failed.")), { once: true });
	});
	const remote = newWebSocketRpcSession<Dispatcher>(socket, new Dispatcher({ api: options.remote ?? {} }));
	const portal = createChannel<Api>({
		adapter: {
			async connect() {
				return {
					remote: remote,
					async close() {
						remote[Symbol.dispose]();
						socket.close();
					},
				};
			},
			async close(): Promise<void> {
				remote[Symbol.dispose]();
				socket.close();
			},
		},
	});
	_cleanups.push(() => portal.close());
	return {
		portal: portal,
		containerPortal: containerPortal,
		socket: socket,
		port: address.port,
		connection: {
			remote: remote,
			async close(): Promise<void> {
				remote[Symbol.dispose]();
				socket.close();
			},
		},
	};
}

describe("worker/container portal", () => {
	it("closes an idle connection after a successful call", async () => {
		const fixture = await _fixture({ add: (): number => 42 }, { idleTimeoutMs: 100 });
		await fixture.portal.add();
		await vi.waitFor(() => expect(fixture.socket.readyState).toBe(WebSocket.CLOSED));
	});

	it("keeps a pending incoming call connected beyond the idle timeout", async () => {
		const result = Promise.withResolvers<number>();
		const fixture = await _fixture({ render: (): Promise<number> => result.promise }, { idleTimeoutMs: 100 });
		const pending = fixture.portal.render();
		await delay(200);
		result.resolve(42);
		expect(await pending).toBe(42);
	});

	it("keeps a pending outgoing call connected beyond the idle timeout", async () => {
		const result = Promise.withResolvers<number>();
		const fixture = await _fixture(
			{},
			{ idleTimeoutMs: 100, remote: { render: (): Promise<number> => result.promise } },
		);
		const pending = fixture.containerPortal.render();
		await delay(200);
		result.resolve(42);
		expect(await pending).toBe(42);
	});

	it("keeps a returned incoming stream connected until its consumer cancels", async () => {
		const fixture = await _fixture(
			{ resource: (): ReadableStream<Uint8Array> => new ReadableStream<Uint8Array>() },
			{ idleTimeoutMs: 100 },
		);
		const stream = await fixture.portal.resource();
		await delay(200);
		const before = fixture.socket.readyState;
		await stream.cancel();
		await vi.waitFor(() => expect(fixture.socket.readyState).toBe(WebSocket.CLOSED));
		expect(before).toBe(WebSocket.OPEN);
	});

	it("keeps a returned outgoing stream connected until its consumer cancels", async () => {
		const fixture = await _fixture(
			{},
			{ idleTimeoutMs: 100, remote: { resource: (): ReadableStream<Uint8Array> => new ReadableStream<Uint8Array>() } },
		);
		const stream = await fixture.containerPortal.resource();
		await delay(200);
		const before = fixture.socket.readyState;
		await stream.cancel();
		await vi.waitFor(() => expect(fixture.socket.readyState).toBe(WebSocket.CLOSED));
		expect(before).toBe(WebSocket.OPEN);
	});

	it("releases an unread returned stream when its call signal aborts", async () => {
		const fixture = await _fixture(
			{},
			{ idleTimeoutMs: 100, remote: { resource: (): ReadableStream<Uint8Array> => new ReadableStream<Uint8Array>() } },
		);
		const controller = new AbortController();
		const stream = await fixture.containerPortal.withOptions({ signal: controller.signal }).resource();
		controller.abort();
		try {
			await vi.waitFor(() => expect(fixture.socket.readyState).toBe(WebSocket.CLOSED));
		} finally {
			await stream.cancel().catch(() => undefined);
		}
	});

	it("releases an idle reservation after an outgoing operation fails", async () => {
		const fixture = await _fixture(
			{},
			{
				idleTimeoutMs: 100,
				remote: {
					fail: (): never => {
						throw new Error("Failed operation.");
					},
				},
			},
		);
		await fixture.containerPortal.fail().catch(() => undefined);
		await vi.waitFor(() => expect(fixture.socket.readyState).toBe(WebSocket.CLOSED));
	});

	it("returns a typed method result over a real WebSocket", async () => {
		const { portal } = await _fixture({ add: (input: { a: number; b: number }): number => input.a + input.b });
		expect(await portal.add({ a: 2, b: 4 })).toBe(6);
	});

	it("preserves bytes including views into larger buffers", async () => {
		const source = Uint8Array.of(0, 1, 2, 3, 4).subarray(1, 4);
		const { portal } = await _fixture({ bytes: (): Uint8Array => source });
		expect(await portal.bytes()).toEqual(Uint8Array.of(1, 2, 3));
	});

	it("preserves owned error codes without serializing stacks", async () => {
		const { portal } = await _fixture({
			fail: (): never => {
				throw Object.assign(new Error("Render rejected."), { errorCode: "REJECTED" });
			},
		});
		expect(portal.fail()).rejects.toMatchObject({
			name: "RemoteError",
			errorCode: "REJECTED",
			message: "Render rejected.",
		});
	});

	it("does not start a call with an already aborted signal", async () => {
		let calls = 0;
		const { portal } = await _fixture({ run: (): number => ++calls });
		await portal
			.withOptions({ signal: AbortSignal.abort() })
			.run()
			.catch(() => undefined);
		expect(calls).toBe(0);
	});

	it("cooperatively cancels the remote operation", async () => {
		const aborted = Promise.withResolvers<boolean>();
		const { portal } = await _fixture({
			async run(_input: undefined, context: CallContext): Promise<void> {
				context.signal.addEventListener("abort", () => aborted.resolve(true), { once: true });
				return new Promise<void>(() => undefined);
			},
		});
		await portal
			.withOptions({ timeoutMs: 30 })
			.run(undefined)
			.catch(() => undefined);
		expect(await aborted.promise).toBe(true);
	});

	it("returns streamed chunks without waiting for the producer to finish", async () => {
		const { portal } = await _fixture({
			read: (): ReadableStream<Uint8Array> =>
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(Uint8Array.of(7));
					},
				}),
		});
		const body = await portal.read();
		const reader = body.getReader();
		const chunk = await reader.read();
		await reader.cancel();
		expect(chunk).toEqual({ done: false, value: Uint8Array.of(7) });
	});

	it("cancels the producer when the received stream is cancelled", async () => {
		const cancelled = Promise.withResolvers<boolean>();
		const { portal } = await _fixture({
			read: (): ReadableStream<Uint8Array> =>
				new ReadableStream<Uint8Array>({
					cancel() {
						cancelled.resolve(true);
					},
				}),
		});
		const body = await portal.read();
		await body.cancel();
		expect(await cancelled.promise).toBe(true);
	});

	it("releases a stream exactly once when cancellation resolves a pending read", async () => {
		let cancelled = 0;
		const { portal } = await _fixture({
			read: (): ReadableStream<Uint8Array> =>
				new ReadableStream<Uint8Array>({
					cancel() {
						cancelled++;
					},
				}),
		});
		const reader = (await portal.read()).getReader();
		const pending = reader.read();
		await reader.cancel();
		await pending;
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(cancelled).toBe(1);
	});

	it("does not intercept ordinary HTTP requests", async () => {
		const { port } = await _fixture({ ping: (): string => "pong" });
		expect(await (await fetch(`http://127.0.0.1:${port}/health`)).text()).toBe("ordinary http");
	});

	it("keeps successful calls working after another call fails", async () => {
		const { portal } = await _fixture({
			fail: (): never => {
				throw new TypeError("Invalid render.");
			},
			ping: (): string => "pong",
		});
		await portal.fail().catch(() => undefined);
		expect(await portal.ping()).toBe("pong");
	});

	it.each([-1, NaN, Infinity])("rejects invalid call deadline %s", async (timeoutMs) => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		expect(() => portal.withOptions({ timeoutMs: timeoutMs })).toThrow(RangeError);
	});

	it("rejects calls after closing the client", async () => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		await portal.close();
		expect(portal.ping()).rejects.toThrow("connection is closed");
	});

	it("constructs meaningful remote errors", () => {
		expect(new RemoteError({ name: "RenderError", message: "Failed." }).remoteName).toBe("RenderError");
	});

	it("retains method names and values in nested result arrays", async () => {
		const { portal } = await _fixture({ values: (): { value: string }[] => [{ value: "one" }, { value: "two" }] });
		expect(await portal.values()).toEqual([{ value: "one" }, { value: "two" }]);
	});

	it("keeps multiple result streams alive until each has been consumed", async () => {
		const stream = (value: number): ReadableStream<Uint8Array> =>
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(Uint8Array.of(value));
					controller.close();
				},
			});
		const { portal } = await _fixture({ read: (): ReadableStream<Uint8Array>[] => [stream(1), stream(2)] });
		const streams = await portal.read();
		const values = await Promise.all(
			streams.map(async (body) => {
				const reader = body.getReader();
				const value = await reader.read();
				await reader.read();
				reader.releaseLock();
				return Array.from(value.value ?? []);
			}),
		);
		expect(values).toEqual([[1], [2]]);
	});

	it("propagates a producer stream error to its consumer", async () => {
		const { portal } = await _fixture({
			read: (): ReadableStream<Uint8Array> =>
				new ReadableStream<Uint8Array>({
					pull() {
						throw new Error("Resource stream failed.");
					},
				}),
		});
		const reader = (await portal.read()).getReader();
		expect(reader.read()).rejects.toThrow("Resource stream failed.");
	});

	it("cancels a returned stream when its original call signal aborts later", async () => {
		const cancelled = Promise.withResolvers<void>();
		const { portal } = await _fixture({
			read: (): ReadableStream<Uint8Array> =>
				new ReadableStream<Uint8Array>({
					cancel() {
						cancelled.resolve();
					},
				}),
		});
		const controller = new AbortController();
		const body = await portal.withOptions({ signal: controller.signal }).read();
		const reader = body.getReader();
		const pending = reader.read().catch(() => undefined);
		controller.abort();
		await cancelled.promise;
		await pending;
		expect(controller.signal.aborted).toBe(true);
	});

	it("does not cancel a sibling operation on the same connection", async () => {
		const started = Promise.withResolvers<void>();
		const { portal } = await _fixture({
			stall: async (_input: undefined, context: CallContext): Promise<void> => {
				started.resolve();
				await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
			},
			ping: (): string => "pong",
		});
		const controller = new AbortController();
		const stalled = portal
			.withOptions({ signal: controller.signal })
			.stall(undefined)
			.catch(() => undefined);
		await started.promise;
		controller.abort();
		await stalled;
		expect(await portal.ping()).toBe("pong");
	});

	it("does not dispatch work when cancellation happens during connection startup", async () => {
		let calls = 0;
		const fixture = await _fixture({ run: (): number => ++calls });
		const gate = Promise.withResolvers<void>();
		const portal = createChannel<{ run(): number }>({
			adapter: {
				async connect() {
					await gate.promise;
					return fixture.connection;
				},
				async close() {},
			},
		});
		const controller = new AbortController();
		const waiting = portal
			.withOptions({ signal: controller.signal })
			.run()
			.catch(() => undefined);
		controller.abort();
		await waiting;
		gate.resolve();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(calls).toBe(0);
	});

	it("does not make the client itself a remote thenable", async () => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		const api = portal;
		expect(await Promise.resolve(api)).toBe(api);
	});

	it("keeps symbol properties outside the remote method surface", async () => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		expect(Reflect.get(portal, Symbol.iterator)).toBeUndefined();
	});

	it("supports a zero millisecond call deadline without dispatching work", async () => {
		let calls = 0;
		const fixture = await _fixture({ run: (): number => ++calls });
		const gate = Promise.withResolvers<void>();
		const portal = createChannel<{ run(): number }>({
			adapter: {
				async connect() {
					await gate.promise;
					return fixture.connection;
				},
				async close() {},
			},
		});
		await portal
			.withOptions({ timeoutMs: 0 })
			.run()
			.catch(() => undefined);
		gate.resolve();
		expect(calls).toBe(0);
	});
});

describe("channel views", () => {
	it("keeps arbitrary arguments separate from call options", async () => {
		const { portal } = await _fixture({
			combine: (
				first: number,
				second: { timeoutMs: number },
				third?: string[],
			): { first: number; second: { timeoutMs: number }; rest: string[] | undefined } => ({
				first: first,
				second: second,
				rest: third,
			}),
		});
		expect(await portal.combine(1, { timeoutMs: 2 }, ["a", "b"])).toEqual({
			first: 1,
			second: { timeoutMs: 2 },
			rest: ["a", "b"],
		});
		expect(await portal.withOptions({ timeoutMs: 500 }).combine(3, { timeoutMs: 4 }, ["c"])).toEqual({
			first: 3,
			second: { timeoutMs: 4 },
			rest: ["c"],
		});
	});
	it("does not mutate the base view or another call's cancellation", async () => {
		const { portal } = await _fixture({ add: (input: { value: number }): number => input.value + 1 });
		const cancelled = portal.withOptions({ signal: AbortSignal.abort() });
		await expect(cancelled.add({ value: 1 })).rejects.toThrow();
		expect(await portal.add({ value: 2 })).toBe(3);
		expect(await portal.withOptions({ timeoutMs: 500 }).add({ value: 3 })).toBe(4);
	});
	it("merges scoped options and allows an explicit override", async () => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		const cancelled = portal.withOptions({ signal: AbortSignal.abort(), timeoutMs: 500 });
		await expect(cancelled.withOptions({ timeoutMs: 1000 }).ping()).rejects.toThrow();
		expect(await cancelled.withOptions({ signal: undefined }).ping()).toBe("pong");
	});
	it("shares connection closure across every view", async () => {
		const { portal } = await _fixture({ ping: (): string => "pong" });
		const scoped = portal.withOptions({ timeoutMs: 500 });
		await scoped.close();
		await expect(portal.ping()).rejects.toThrow("connection is closed");
		await expect(scoped.ping()).rejects.toThrow("connection is closed");
		await portal.close();
	});

	it("waits for pending cleanup in every concurrent close call", async () => {
		const cleanup = Promise.withResolvers<void>();
		const adapter = td.object<Adapter>();
		td.when(adapter.close()).thenReturn(cleanup.promise);
		const portal = createChannel<object>({ adapter: adapter });
		const first = portal.close();
		let secondFinished = false;
		const second = portal
			.withOptions({})
			.close()
			.then(() => {
				secondFinished = true;
			});
		try {
			await Promise.resolve();
			expect(secondFinished).toBe(false);
		} finally {
			cleanup.resolve();
			await Promise.all([first, second]);
		}
		expect(secondFinished).toBe(true);
		td.verify(adapter.close(), { times: 1 });
	});
	it.each(["close", "withOptions", "then"])("rejects exposed methods reserved by the channel: %s", (method) => {
		expect(() => new Dispatcher({ api: { [method]: (): number => 1 } })).toThrow(`Portal method ${method} is reserved`);
	});
});
