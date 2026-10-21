import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import type { connectContainerToWorker } from "@cataqui/workerhole";
import { Server } from "node:http";
import type { serve } from "srvx/node";
import * as td from "testdouble";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { createMapshotApplication } from "./app.module";
import type { MapshotApplication } from "./application";
import type { createHealthHandler } from "./health/health.controller";
import type { MapshotWorkerContainerPortal } from "./worker-container-portal";

type _Host = ReturnType<typeof serve>;

const _dependencies = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		serve: td.func<typeof serve>(),
		application: td.func<typeof createMapshotApplication>(),
		health: td.func<typeof createHealthHandler>(),
		connect: td.func<typeof connectContainerToWorker>(),
	};
});
vi.mock("srvx/node", () => ({ serve: _dependencies.serve }));
vi.mock("./app.module", () => ({ createMapshotApplication: _dependencies.application }));
vi.mock("./health/health.controller", () => ({ createHealthHandler: _dependencies.health }));
vi.mock("@cataqui/workerhole", async (original) => ({
	...(await original<typeof import("@cataqui/workerhole")>()),
	connectContainerToWorker: _dependencies.connect,
}));

afterEach(() => td.reset());
let _host: _Host;
let _application: MapshotApplication;
let _workerContainerPortal: MapshotWorkerContainerPortal;
let _worker: MapshotWorkerPortal;
let _signals: Map<string | symbol, () => void>;
let _events: string[];
let _warn: typeof console.warn;
let _exitCode: typeof process.exitCode;
let _server: Server;
let _shutdown: AbortController;
let _state: { ready: boolean };

beforeEach(() => {
	vi.resetModules();
	_exitCode = process.exitCode;
	_signals = new Map();
	_events = [];
	_shutdown = new AbortController();
	_state = { ready: false };
	_server = new Server();
	Object.defineProperty(_server, "listening", { configurable: true, value: true });
	_host = Object.assign(td.object<_Host>(), {
		node: { server: _server, handler: td.func<NonNullable<_Host["node"]>["handler"]>() },
	});
	_application = td.object<MapshotApplication>();
	const indexes = { archiveId: "a".repeat(64), sha256: "b".repeat(64) } satisfies NonNullable<
		MapshotApplication["indexes"]
	>;
	Object.defineProperties(_application, {
		signal: { get: (): AbortSignal => _shutdown.signal },
		ready: { get: (): boolean => _state.ready && !_shutdown.signal.aborted },
		indexes: { get: (): MapshotApplication["indexes"] => (_application.ready ? indexes : undefined) },
	});
	_workerContainerPortal = td.object<MapshotWorkerContainerPortal>();
	_worker = td.object<MapshotWorkerPortal>();
	_warn = td.replace(console, "warn");
	td.replace(process, "once");
	td.when(process.once(td.matchers.anything(), td.matchers.anything())).thenDo(
		(signal: string | symbol, callback: () => void): typeof process => {
			_signals.set(signal, callback);
			return process;
		},
	);
	td.when(_dependencies.serve(td.matchers.anything())).thenReturn(_host);
	td.when(_dependencies.health(td.matchers.anything())).thenReturn(td.func<ReturnType<typeof createHealthHandler>>());
	td.when(_dependencies.application()).thenReturn({
		application: _application,
		workerContainerPortal: _workerContainerPortal,
	});
	td.when(_dependencies.connect(td.matchers.anything(), td.matchers.anything())).thenDo(
		async (): Promise<MapshotWorkerPortal> => {
			_events.push("workerhole");
			return _worker;
		},
	);
	td.when(_host.serve()).thenDo(async (): Promise<_Host> => {
		_events.push("listen");
		return _host;
	});
	td.when(_application.initialize(td.matchers.anything())).thenDo(async (): Promise<void> => {
		_events.push("initialize");
		_state.ready = true;
	});
	td.when(_worker.close()).thenResolve(undefined);
	td.when(_host.close(true)).thenResolve(undefined);
	td.when(_application.close()).thenDo(async (): Promise<void> => {
		_shutdown.abort();
		_state.ready = false;
	});
});

afterEach(async () => {
	_signals.get("SIGTERM")?.();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	process.exitCode = _exitCode;
});

function _healthOptions(): Parameters<typeof createHealthHandler>[0] {
	const options = td.explain(_dependencies.health).calls[0]?.args[0];
	if (options === undefined) throw new TypeError("Expected a health handler.");
	return options;
}

async function _ready(): Promise<void> {
	await vi.waitFor(() => expect(_healthOptions().ready()).toBe(true));
}

it("registers the resolved container portal before listening and initializes with its Worker client", async () => {
	await import("./main");
	await _ready();
	expect(_events).toEqual(["workerhole", "listen", "initialize"]);
	const hostOptions = td.explain(_dependencies.serve).calls[0]?.args[0];
	expect(hostOptions).toEqual({
		port: 8080,
		hostname: "0.0.0.0",
		manual: true,
		gracefulShutdown: false,
		node: { maxHeaderSize: 8192, requestTimeout: 45000, headersTimeout: 10000, keepAliveTimeout: 5000 },
		fetch: expect.any(Function),
	});
	expect(td.explain(_dependencies.connect).calls[0]?.args[0]).toBe(
		(await import("@cataqui/mapshot-workerhole")).MapshotWorkerPortal,
	);
	expect(td.explain(_dependencies.connect).calls[0]?.args[1]).not.toHaveProperty("server");
	expect(td.explain(_dependencies.connect).calls[0]?.args[1].expose).toBe(_workerContainerPortal);
	expect(td.explain(_application.initialize).calls[0]?.args[0]?.worker).toBe(_worker);
	expect(_healthOptions().indexes?.()).toBe(_application.indexes);
	expect(td.explain(_dependencies.application).calls.map(({ args }) => args)).toEqual([[]]);
});

it("delegates health readiness and indexes to the application during initialization", async () => {
	const pending = Promise.withResolvers<void>();
	td.when(_application.initialize(td.matchers.anything())).thenReturn(pending.promise);
	_state.ready = false;
	await import("./main");
	expect(_healthOptions().ready()).toBe(false);
	expect(_healthOptions().indexes?.()).toBeUndefined();
	_state.ready = true;
	pending.resolve();
	await _ready();
	expect(_healthOptions().indexes?.()).toBe(_application.indexes);
});

it.each(["SIGTERM", "SIGINT"] as const)(
	"marks unready immediately and closes each resource once on %s",
	async (signal) => {
		await import("./main");
		await _ready();
		_signals.get(signal)?.();
		_signals.get("SIGINT")?.();
		expect(_application.signal.aborted).toBe(true);
		expect(_healthOptions().ready()).toBe(false);
		await vi.waitFor(() => expect(td.explain(_host.close).callCount).toBe(1));
		expect(td.explain(_application.close).callCount).toBe(1);
		expect(td.explain(_worker.close).callCount).toBe(1);
	},
);

it("requests application cleanup immediately while initialization is pending", async () => {
	const pending = Promise.withResolvers<void>();
	td.when(_application.initialize(td.matchers.anything())).thenReturn(pending.promise);
	await import("./main");
	await vi.waitFor(() => expect(td.explain(_application.initialize).callCount).toBe(1));
	_signals.get("SIGTERM")?.();
	expect(td.explain(_application.close).callCount).toBe(1);
	expect(_application.signal.aborted).toBe(true);
	pending.resolve();
	await Promise.resolve();
	expect(_healthOptions().ready()).toBe(false);
	expect(td.explain(_application.close).callCount).toBe(1);
});

it("waits for pending listening during shutdown and skips application initialization", async () => {
	const listening = Promise.withResolvers<_Host>();
	td.when(_host.serve()).thenReturn(listening.promise);
	await import("./main");
	_signals.get("SIGTERM")?.();
	expect(td.explain(_host.close).callCount).toBe(0);
	expect(td.explain(_application.close).callCount).toBe(1);
	listening.resolve(_host);
	await vi.waitFor(() => expect(td.explain(_host.close).callCount).toBe(1));
	expect(td.explain(_application.initialize).callCount).toBe(0);
	expect(_healthOptions().ready()).toBe(false);
});

it("keeps failed initialization unready and logs only a sanitized event", async () => {
	td.when(_application.initialize(td.matchers.anything())).thenReject(new Error("private startup credentials"));
	_state.ready = false;
	await import("./main");
	await vi.waitFor(() => td.verify(_warn({ event: "mapshot.renderer.initialization-failed" })));
	expect(_healthOptions().ready()).toBe(false);
	expect(process.exitCode).toBe(_exitCode);
});

it.each([false, true])(
	"handles listener failure with shutdown=%s without initializing the application",
	async (stopping) => {
		const listening = Promise.withResolvers<_Host>();
		Object.defineProperty(_server, "listening", { value: false });
		td.when(_host.serve()).thenReturn(listening.promise);
		await import("./main");
		if (stopping) _signals.get("SIGTERM")?.();
		listening.reject(new Error("private listener details"));
		await vi.waitFor(() => td.verify(_warn({ event: "mapshot.renderer.initialization-failed" })));
		expect(process.exitCode).toBe(stopping ? _exitCode : 1);
		expect(td.explain(_application.initialize).callCount).toBe(0);
	},
);

it.each(["workerhole", "http", "renderer"] as const)("continues cleanup when %s shutdown fails", async (resource) => {
	const failure = new Error("private shutdown diagnostics");
	if (resource === "workerhole") td.when(_worker.close()).thenReject(failure);
	if (resource === "http") td.when(_host.close(true)).thenReject(failure);
	if (resource === "renderer")
		td.when(_application.close()).thenDo(async (): Promise<void> => {
			_shutdown.abort();
			throw failure;
		});
	_shutdown = new AbortController();
	await import("./main");
	await _ready();
	_signals.get("SIGTERM")?.();
	await vi.waitFor(() => td.verify(_warn({ event: `mapshot.${resource}.shutdown-failed` })));
	expect(td.explain(_worker.close).callCount).toBe(1);
	expect(td.explain(_host.close).callCount).toBe(1);
	expect(td.explain(_application.close).callCount).toBe(1);
});

it("rejects portal listener failure before starting public HTTP", async () => {
	td.when(_dependencies.connect(td.matchers.anything(), td.matchers.anything())).thenReject(
		new Error("portal port occupied"),
	);
	await expect(import("./main")).rejects.toThrow("portal port occupied");
	expect(td.explain(_host.serve).callCount).toBe(0);
	expect(td.explain(_application.initialize).callCount).toBe(0);
});
