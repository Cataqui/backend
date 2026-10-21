import type { RpcStub } from "capnweb";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter } from "./adapter.types";
import { Call, type Dispatcher } from "./dispatcher";

vi.mock("capnweb", async (importOriginal) => {
	const actual = await importOriginal<typeof import("capnweb")>();
	return {
		...actual,
		newWorkersWebSocketRpcResponse: (): Response => new Response("upgraded"),
		newWebSocketRpcSession: (_socket: unknown, localMain: Dispatcher): RpcStub<Dispatcher> =>
			new actual.RpcStub(localMain),
	};
});

import { createWorkerAdapter, WorkerPortal } from "./worker-adapter";

afterEach(() => td.reset());

function _fixture(params: { gate?: Promise<void>; status?: number } = {}): {
	adapter: Adapter;
	request: Fetcher["fetch"];
	socket: {
		accept: WebSocket["accept"];
		close: WebSocket["close"];
		addEventListener(name: string, callback: () => void): Map<string, () => void>;
	};
	events: Map<string, () => void>;
	intercept: Container["interceptOutboundHttp"];
	context: Parameters<typeof createWorkerAdapter>[0]["context"];
	container: Container;
	response: Response;
	expose: Parameters<typeof createWorkerAdapter>[0]["expose"];
} {
	const events = new Map<string, () => void>();
	const socket = {
		accept: td.func<WebSocket["accept"]>(),
		close: td.func<WebSocket["close"]>(),
		addEventListener: (name: string, callback: () => void): Map<string, () => void> => events.set(name, callback),
	};
	const response =
		params.status === undefined
			? Object.assign(new Response(), { webSocket: socket })
			: new Response(null, { status: params.status });
	const request = td.func<Fetcher["fetch"]>();
	td.when(request(td.matchers.anything(), td.matchers.anything())).thenResolve(response);
	const intercept = td.func<Container["interceptOutboundHttp"]>();
	td.when(intercept(td.matchers.anything(), td.matchers.anything())).thenDo(async (): Promise<void> => {
		await params.gate;
	});
	const context = td.object<Parameters<typeof createWorkerAdapter>[0]["context"]>();
	td.when(context.blockConcurrencyWhile(td.matchers.anything())).thenDo(
		(callback: () => Promise<void>): Promise<void> => callback(),
	);
	const container = td.object<Container>();
	container.interceptOutboundHttp = intercept;
	const port = td.object<ReturnType<Container["getTcpPort"]>>();
	port.fetch = request;
	td.when(container.getTcpPort(td.matchers.anything())).thenReturn(port);
	const expose = td.func<Parameters<typeof createWorkerAdapter>[0]["expose"]>();
	td.when(expose(td.matchers.anything())).thenReturn(expose);
	const adapter = createWorkerAdapter({
		context: context,
		container: container,
		expose: expose,
	});
	return {
		adapter: adapter,
		request: request,
		socket: socket,
		events: events,
		intercept: intercept,
		context: context,
		container: container,
		response: response,
		expose: expose,
	};
}

describe("Cloudflare adapter", () => {
	it("rejects a Durable Object without a container", () => {
		expect(() =>
			createWorkerAdapter({
				context: td.object<DurableObjectState>(),
				container: undefined,
				expose: td.object<Parameters<typeof createWorkerAdapter>[0]["expose"]>(),
			}),
		).toThrow(TypeError);
	});

	it("registers its private hostname through the native expose binding", async () => {
		const fixture = _fixture();
		await fixture.adapter.connect();
		await fixture.adapter.close();
		expect(td.explain(fixture.intercept).calls[0]?.args[0]).toBe("workerhole.internal");
	});

	it("waits for native routing registration before upgrading the container connection", async () => {
		const gate = Promise.withResolvers<void>();
		const fixture = _fixture({ gate: gate.promise });
		const pending = fixture.adapter.connect();
		await Promise.resolve();
		const before = td.explain(fixture.request).callCount;
		gate.resolve();
		await pending;
		await fixture.adapter.close();
		expect({
			before: before,
			after: td.explain(fixture.request).callCount,
		}).toEqual({ before: 0, after: 1 });
	});

	it("deduplicates concurrent connection attempts", async () => {
		const fixture = _fixture();
		const connections = await Promise.all([fixture.adapter.connect(), fixture.adapter.connect()]);
		await fixture.adapter.close();
		expect(connections[0]).toBe(connections[1]);
	});

	it("reuses the established connection", async () => {
		const fixture = _fixture();
		await fixture.adapter.connect();
		await fixture.adapter.connect();
		await fixture.adapter.close();
		expect(td.explain(fixture.request).callCount).toBe(1);
	});

	it("creates a replacement after the former socket closes", async () => {
		const fixture = _fixture();
		await fixture.adapter.connect();
		fixture.events.get("close")?.();
		await fixture.adapter.connect();
		await fixture.adapter.close();
		expect(td.explain(fixture.request).callCount).toBe(2);
	});

	it("rejects a container without an Workerhole WebSocket endpoint before dispatch", async () => {
		const fixture = _fixture({ status: 404 });
		await expect(fixture.adapter.connect()).rejects.toMatchObject({
			name: "PortalUnavailableError",
		});
	});

	it("cancels an unsuccessful upgrade response body before rejecting the connection", async () => {
		const fixture = _fixture();
		let cancelled = false;
		const response = new Response(
			new ReadableStream<Uint8Array>({
				cancel(): void {
					cancelled = true;
				},
			}),
			{ status: 503 },
		);
		td.when(fixture.request(td.matchers.anything(), td.matchers.anything())).thenResolve(response);
		await expect(fixture.adapter.connect()).rejects.toMatchObject({ name: "PortalUnavailableError" });
		expect(cancelled).toBe(true);
		await fixture.adapter.close();
	});

	it("rejects future connection attempts after close", async () => {
		const fixture = _fixture();
		await fixture.adapter.close();
		await expect(fixture.adapter.connect()).rejects.toMatchObject({
			name: "ConnectionClosedError",
		});
	});

	it("closes a late upgrade after shutdown", async () => {
		const gate = Promise.withResolvers<void>();
		const fixture = _fixture();
		td.when(fixture.request(td.matchers.anything(), td.matchers.anything())).thenDo(async (): Promise<Response> => {
			await gate.promise;
			return fixture.response;
		});
		const pending = fixture.adapter.connect().catch((error: unknown) => error);
		await vi.waitUntil(() => td.explain(fixture.request).callCount > 0);
		await fixture.adapter.close();
		gate.resolve();
		await pending;
		td.verify(fixture.socket.close(), { times: 1 });
	});

	it("does not connect after shutdown during outbound registration", async () => {
		const gate = Promise.withResolvers<void>();
		const fixture = _fixture({ gate: gate.promise });
		const pending = fixture.adapter.connect().catch((error: unknown) => error);
		await fixture.adapter.close();
		gate.resolve();
		await pending;
		expect(td.explain(fixture.request).callCount).toBe(0);
	});

	it("passes the idle policy through the native loopback binding props", async () => {
		const fixture = _fixture();
		const target = {
			fetch: async (): Promise<Response> => new Response(),
			start: async (): Promise<undefined> => undefined,
		};
		const binding = Object.assign(td.func<Parameters<typeof createWorkerAdapter>[0]["expose"]>(), target);
		td.when(binding({ props: { idleTimeoutMs: 60_000 } })).thenReturn(target);
		const adapter = createWorkerAdapter({
			context: fixture.context,
			container: fixture.container,
			expose: binding,
			idleTimeoutMs: 60_000,
		});
		await adapter.connect();
		await adapter.close();
		expect(td.explain(binding).calls.map((call) => call.args)).toEqual([[{ props: { idleTimeoutMs: 60_000 } }]]);
	});

	it("passes the idle policy to the container connection", async () => {
		const fixture = _fixture();
		const adapter = createWorkerAdapter({
			context: fixture.context,
			container: fixture.container,
			expose: fixture.expose,
			idleTimeoutMs: 60_000,
		});
		await adapter.connect();
		await adapter.close();
		expect(td.explain(fixture.request).calls.map((call) => call.args)).toEqual([
			[
				"http://container/internal/workerhole",
				{
					headers: {
						upgrade: "websocket",
						"x-workerhole-idle-timeout-ms": "60000",
					},
				},
			],
		]);
	});

	it("propagates a native registration failure", async () => {
		const failure = new Error("Native route unavailable.");
		const fixture = _fixture({ gate: Promise.reject(failure) });
		await expect(fixture.adapter.connect()).rejects.toBe(failure);
	});

	it("routes callbacks through the same native Worker expose selected for interception", async () => {
		const fixture = _fixture();
		let method = "";
		const adapter = createWorkerAdapter({
			context: fixture.context,
			container: fixture.container,
			expose: Object.assign(td.func<Parameters<typeof createWorkerAdapter>[0]["expose"]>(), {
				fetch: async (): Promise<Response> => new Response(),
				start: async (invocation: { method: string; args: unknown[] }): Promise<Call> => {
					method = invocation.method;
					return new Call({
						api: { ping: (): number => 7 },
						invocation: invocation,
					});
				},
			}),
		});
		const connection = await adapter.connect();
		const call = await connection.remote.start({ method: "ping", args: [] });
		await call.result();
		call[Symbol.dispose]();
		await adapter.close();
		expect(method).toBe("ping");
	});
});

describe("Worker expose", () => {
	class Entrypoint extends WorkerPortal<{ value: number }> {
		override readonly expose = { value: (): number => this.env.value };
	}
	it("keeps non-upgrade requests outside its Workerhole receiver", () => {
		const expose = new Entrypoint(td.object<ConstructorParameters<typeof Entrypoint>[0]>(), { value: 7 });
		expect(expose.fetch(new Request("http://portal/")).status).toBe(404);
	});
	it("serves a WebSocket upgrade through Cap’n Web", () => {
		const expose = new Entrypoint(td.object<ConstructorParameters<typeof Entrypoint>[0]>(), { value: 7 });
		expect(expose.fetch(new Request("http://portal/", { headers: { upgrade: "websocket" } })).status).toBe(200);
	});
	it("passes its configured idle policy to a Node-first WebSocket session", () => {
		const context = Object.assign(td.object<ConstructorParameters<typeof Entrypoint>[0]>(), {
			props: { idleTimeoutMs: 60_000 },
		});
		const expose = new Entrypoint(context, { value: 7 });
		const response = expose.fetch(new Request("http://portal/", { headers: { upgrade: "websocket" } }));
		expect(response.headers.get("x-workerhole-idle-timeout-ms")).toBe("60000");
	});

	it("dispatches only the API defined by its subclass", async () => {
		const expose = new Entrypoint(td.object<ConstructorParameters<typeof Entrypoint>[0]>(), { value: 7 });
		const call = expose.start({ method: "value", args: [] });
		const result = await call.result();
		call[Symbol.dispose]();
		expect(result).toEqual({ ok: true, value: 7 });
	});
	it("does not expose methods inherited from the expose", async () => {
		const expose = new Entrypoint(td.object<ConstructorParameters<typeof Entrypoint>[0]>(), { value: 7 });
		const call = expose.start({ method: "fetch", args: [] });
		expect((await call.result()).ok).toBe(false);
	});
	it("preserves a non-Error rejection as an operation failure", async () => {
		const call = new Call({
			api: {
				fail: (): never => {
					throw "invalid";
				},
			},
			invocation: { method: "fail", args: [] },
		});
		expect(await call.result()).toMatchObject({
			ok: false,
			error: { message: "Portal operation threw a non-Error value." },
		});
	});
	it("does not start an operation cancelled before its asynchronous invocation", async () => {
		let calls = 0;
		const call = new Call({
			api: { run: (): number => ++calls },
			invocation: { method: "run", args: [] },
		});
		call.cancel();
		await call.result();
		expect(calls).toBe(0);
	});
});
