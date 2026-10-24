import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import { ApiContainer } from "./container";
import { ApiWorkerPortal } from "./worker-portal";
import type { ConnectToContainerOptions } from "@cataqui/workerhole";
import { ApiWorkerContainerPortal } from "@cataqui/api-workerhole";

const _workerhole = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { create: td.func<typeof import("@cataqui/workerhole").connectWorkerToContainer>() };
});
vi.mock("@cataqui/workerhole", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cataqui/workerhole")>()),
	connectWorkerToContainer: _workerhole.create,
}));

function _setup(
	params: {
		running?: boolean;
		missing?: boolean;
		sleepAfterMs?: ApiWorkerEnv["SLEEP_AFTER_MS"];
		beforeStart?: () => void;
	} = {},
): {
	api: ApiContainer;
	container: Container & { running: boolean };
	health: () => Promise<Response>;
	forward: () => Promise<Response>;
	port: Fetcher;
	context: DurableObjectState & {
		container: (Container & { running: boolean }) | undefined;
	};
	environment: ApiWorkerEnv;
	exit: PromiseWithResolvers<void>;
	background: Promise<unknown>[];
	channel: ApiWorkerContainerPortal;
	order: string[];
} {
	const exit = Promise.withResolvers<void>();
	const health = td.func<() => Promise<Response>>();
	td.when(health()).thenDo(async (): Promise<Response> => new Response(null, { status: 200 }));
	const forward = td.func<() => Promise<Response>>();
	td.when(forward()).thenDo(async (): Promise<Response> => new Response("api response"));
	const order: string[] = [];
	const container = Object.assign(td.object<Container>(), { running: params.running ?? false });
	td.when(container.start(td.matchers.anything())).thenDo((): void => {
		params.beforeStart?.();
		order.push("start");
		container.running = true;
	});
	td.when(container.monitor()).thenReturn(exit.promise);
	td.when(container.setInactivityTimeout(td.matchers.anything())).thenResolve(undefined);
	const fetchPort = td.object<Fetcher>();
	td.when(fetchPort.fetch(td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(
		(request: RequestInfo): Promise<Response> =>
			new URL(typeof request === "string" ? request : request.url).pathname === "/v1/health/live"
				? health()
				: forward(),
	);
	td.when(container.getTcpPort(td.matchers.anything())).thenReturn(fetchPort);
	const background: Promise<unknown>[] = [];
	const context = Object.assign(td.object<DurableObjectState>(), {
		container: params.missing ? undefined : container,
	});
	td.when(context.blockConcurrencyWhile(td.matchers.anything())).thenDo(
		(operation: () => Promise<unknown>): Promise<unknown> => Promise.resolve().then(operation),
	);
	td.when(context.waitUntil(td.matchers.anything())).thenDo((operation: Promise<unknown>): void => {
		background.push(operation);
	});
	const environment = {
		ENVIRONMENT: "development",
		DATABASE_APP_POOLER_URL: "postgresql://test:test@localhost/test",
		CORS_ORIGINS: "http://localhost:3000",
		CLOUDFLARE_ACCOUNT_ID: "1fca946385505503c59dd6a2a4eeb442",
		AI_GATEWAY_API_TOKEN: "test-gateway",
		AI_GATEWAY_ID: "cataqui-api-development",
		UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
		UPSTASH_REDIS_REST_TOKEN: "test-redis",
		SLEEP_AFTER_MS: params.sleepAfterMs ?? 300_000,
		MAPS: td.object<ApiWorkerEnv["MAPS"]>(),
		AUTH: td.object<ApiWorkerEnv["AUTH"]>(),
	} satisfies ApiWorkerEnv;
	const channel = td.object<ApiWorkerContainerPortal>();
	td.when(channel.close()).thenResolve(undefined);
	td.when(
		_workerhole.create(ApiWorkerContainerPortal, {
			context: context,
			expose: ApiWorkerPortal,
			idleTimeoutMs: 60_000,
		}),
	).thenDo((): ApiWorkerContainerPortal => {
		order.push("endpoint");
		return channel;
	});
	const api = new ApiContainer(context, environment);
	return {
		api: api,
		container: container,
		health: health,
		forward: forward,
		port: fetchPort,
		context: context,
		environment: environment,
		exit: exit,
		background: background,
		channel: channel,
		order: order,
	};
}

beforeEach(() => {
	td.replace(console, "error");
	td.replace(console, "info");
});
afterEach(() => td.reset());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it("should leave an unused API container stopped", () => {
	const runtime = _setup();
	expect(td.explain(runtime.container.start).callCount).toBe(0);
	expect(td.explain(_workerhole.create).callCount).toBe(0);
});

it("registers a fresh endpoint after the monitored API process exits", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	runtime.container.running = false;
	runtime.exit.resolve();
	await Promise.all(runtime.background);
	expect(td.explain(runtime.channel.close).callCount).toBe(1);
	const nextExit = Promise.withResolvers<void>();
	td.when(runtime.container.monitor()).thenReturn(nextExit.promise);
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	expect(td.explain(_workerhole.create).callCount).toBe(2);
});

it("registers the reusable endpoint before starting the API process", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await runtime.api.fetch(new Request("http://localhost/v1/feed"));
	expect(td.explain(_workerhole.create).callCount).toBe(1);
	const registration: ConnectToContainerOptions = td.explain(_workerhole.create).calls[0]?.args[1];
	expect(registration.context).toBe(runtime.context);
	expect(registration.expose).toBe(ApiWorkerPortal);
	expect(registration.idleTimeoutMs).toBe(60_000);
	expect(registration).not.toHaveProperty("port");
	expect(runtime.order).toEqual(["endpoint", "start"]);
});

it("exposes only public HTTP while keeping lifecycle methods private", () => {
	// Workers portal exposes prototype methods; TypeScript's private modifier alone does not hide them.
	expect(
		Object.getOwnPropertyNames(ApiContainer.prototype)
			.filter((name) => name !== "constructor")
			.sort(),
	).toEqual(["fetch"]);
});

it("should forward public method, body, headers and query through port 3000 over HTTP", async () => {
	const runtime = _setup();
	const request = new Request("https://api.cataqui.com/v1/jobs?limit=2", {
		method: "POST",
		headers: { "x-test": "yes" },
		body: "body",
	});
	await runtime.api.fetch(request);
	const forwarded: unknown = td.explain(runtime.port.fetch).calls.at(-1)?.args[0];
	if (!(forwarded instanceof Request)) throw new Error("Expected a forwarded Request.");
	expect({
		url: forwarded.url,
		method: forwarded.method,
		header: forwarded.headers.get("x-test"),
		body: await forwarded.text(),
	}).toEqual({ url: "http://api.cataqui.com/v1/jobs?limit=2", method: "POST", header: "yes", body: "body" });
});

it("should forward only the explicit API process environment and retain external network access", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	const env = runtime.environment;
	expect(td.explain(runtime.container.start).calls.map((call) => call.args)).toEqual([
		[
			{
				enableInternet: true,
				env: {
					ENVIRONMENT: env.ENVIRONMENT,
					DATABASE_APP_POOLER_URL: env.DATABASE_APP_POOLER_URL,
					CORS_ORIGINS: env.CORS_ORIGINS,
					CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
					AI_GATEWAY_API_TOKEN: env.AI_GATEWAY_API_TOKEN,
					AI_GATEWAY_ID: env.AI_GATEWAY_ID,
					UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
					UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
				},
			},
		],
	]);
});

it("should wait for a successful liveness response before forwarding demand", async () => {
	const runtime = _setup();
	const ready = Promise.withResolvers<Response>();
	td.when(runtime.health()).thenReturn(ready.promise);
	const response = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.waitUntil(() => td.explain(runtime.health).callCount === 1);
	const before = td.explain(runtime.forward).callCount;
	ready.resolve(new Response(null, { status: 200 }));
	await response;
	expect({ before: before, after: td.explain(runtime.forward).callCount }).toEqual({ before: 0, after: 1 });
});

it("should share startup while allowing concurrent requests after readiness", async () => {
	const runtime = _setup();
	const response = Promise.withResolvers<Response>();
	td.when(runtime.forward()).thenReturn(response.promise);
	const first = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	const second = runtime.api.fetch(new Request("http://localhost/v1/feed"));
	await vi.waitUntil(() => td.explain(runtime.forward).callCount === 2);
	response.resolve(new Response("ok"));
	await Promise.all([first, second]);
	expect({
		starts: td.explain(runtime.container.start).callCount,
		health: td.explain(runtime.health).callCount,
		forwards: td.explain(runtime.forward).callCount,
	}).toEqual({ starts: 1, health: 1, forwards: 2 });
});

it("bounds stalled health fetches per attempt and releases a late body before the overall startup deadline", async () => {
	vi.useFakeTimers();
	td.replace(AbortSignal, "timeout");
	td.when(AbortSignal.timeout(td.matchers.anything())).thenDo((milliseconds: number): AbortSignal => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), milliseconds);
		return controller.signal;
	});
	const runtime = _setup();
	const stalled = Promise.withResolvers<Response>();
	td.when(runtime.health()).thenReturn(stalled.promise, Promise.resolve(new Response(null, { status: 200 })));
	const request = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(5_300);
	expect(td.explain(runtime.health).callCount).toBe(2);
	await expect(request).resolves.toHaveProperty("status", 200);
	const late = new Response("late health");
	const cancel = vi.spyOn(late.body!, "cancel");
	stalled.resolve(late);
	await vi.advanceTimersByTimeAsync(0);
	expect(cancel).toHaveBeenCalledOnce();
});

it.each([300_000, 3_600_000] as const)(
	"should preserve the configured %i millisecond inactivity window",
	async (milliseconds) => {
		const runtime = _setup({ sleepAfterMs: milliseconds });
		await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
		expect(td.explain(runtime.container.setInactivityTimeout).calls.map((call) => call.args)).toContainEqual([
			milliseconds,
		]);
	},
);

it("should restore the channel, inactivity and monitoring for an already running process", async () => {
	const runtime = _setup({ running: true });
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	expect({
		starts: td.explain(runtime.container.start).callCount,
		monitors: td.explain(runtime.container.monitor).callCount,
		timeouts: td.explain(runtime.container.setInactivityTimeout).calls.map((call) => call.args),
	}).toEqual({ starts: 0, monitors: 1, timeouts: [[300000]] });
	expect(td.explain(_workerhole.create).callCount).toBe(1);
});

it("should return an empty unavailable response when no container is bound", async () => {
	const runtime = _setup({ missing: true });
	const response = await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	expect({ status: response.status, body: await response.text() }).toEqual({ status: 503, body: "" });
});

it("should not replay a failed application request", async () => {
	const runtime = _setup();
	td.when(runtime.forward()).thenReject(new Error("private provider credentials"));
	const response = await runtime.api.fetch(new Request("http://localhost/v1/jobs", { method: "POST", body: "{}" }));
	expect({
		status: response.status,
		body: await response.text(),
		forwards: td.explain(runtime.forward).callCount,
	}).toEqual({ status: 503, body: "", forwards: 1 });
});

it("should restart and recheck readiness after the process exits", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	runtime.container.running = false;
	runtime.exit.resolve();
	await Promise.all(runtime.background);
	td.when(runtime.container.monitor()).thenReturn(new Promise<void>(() => undefined));
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	expect({
		starts: td.explain(runtime.container.start).callCount,
		health: td.explain(runtime.health).callCount,
	}).toEqual({
		starts: 2,
		health: 2,
	});
});

it("should log a sanitized process failure and allow later startup", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	runtime.container.running = false;
	runtime.exit.reject(Object.assign(new Error("private provider credentials"), { exitCode: 7 }));
	await Promise.all(runtime.background);
	expect(td.explain(console.error).calls.map((call) => call.args)).toContainEqual([
		{ event: "api.container.stopped", exitCode: 7 },
	]);
});

it("should retry temporary allocation failure within the startup deadline", async () => {
	vi.useFakeTimers();
	let attempts = 0;
	const runtime = _setup({
		beforeStart: () => {
			if (attempts++ === 0) throw new Error("temporary capacity");
		},
	});
	const response = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(300);
	await response;
	expect(td.explain(runtime.container.start).callCount).toBe(2);
});

it("should retry unhealthy liveness responses before forwarding", async () => {
	vi.useFakeTimers();
	const runtime = _setup();
	td.when(runtime.health()).thenResolve(new Response(null, { status: 503 }), new Response(null, { status: 200 }));
	const response = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(300);
	await response;
	expect({
		healthChecks: td.explain(runtime.health).callCount,
		timeouts: td.explain(runtime.container.setInactivityTimeout).callCount,
	}).toEqual({ healthChecks: 2, timeouts: 1 });
});

it("should reuse a healthy running process without repeating its readiness check", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await runtime.api.fetch(new Request("http://localhost/v1/feed"));
	expect(td.explain(runtime.health).callCount).toBe(1);
});

it("should retry failed health connections without forwarding application requests early", async () => {
	vi.useFakeTimers();
	const runtime = _setup();
	let attempts = 0;
	td.when(runtime.health()).thenDo(async (): Promise<Response> => {
		if (attempts++ === 0) throw new Error("not listening");
		return new Response(null, { status: 200 });
	});
	const result = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(300);
	const response = await result;
	expect({
		status: response.status,
		health: td.explain(runtime.health).callCount,
		forwards: td.explain(runtime.forward).callCount,
	}).toEqual({ status: 200, health: 2, forwards: 1 });
});

it("should report failed running-process restoration without an unhandled background rejection", async () => {
	vi.useFakeTimers();
	const runtime = _setup({ running: true });
	td.when(runtime.health()).thenReject(new Error("not listening"));
	await vi.advanceTimersByTimeAsync(20000);
	await runtime.background.at(-1);
	expect(td.explain(console.error).calls.map((call) => call.args)).toContainEqual([
		{ event: "api.container.restore.failed" },
	]);
});

it("should sanitize a process error that has no exit code", async () => {
	const runtime = _setup();
	await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	runtime.exit.reject("private runtime details");
	await Promise.all(runtime.background);
	expect(td.explain(console.error).calls.map((call) => call.args)).toContainEqual([{ event: "api.container.stopped" }]);
});

it.each(["resolve", "reject"] as const)(
	"should ignore an old process %s after a replacement has become ready",
	async (outcome) => {
		const runtime = _setup();
		await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
		runtime.container.running = false;
		td.when(runtime.container.monitor()).thenReturn(new Promise<void>(() => undefined), runtime.exit.promise);
		await runtime.api.fetch(new Request("http://localhost/v1/feed"));
		if (outcome === "resolve") runtime.exit.resolve();
		else runtime.exit.reject(new Error("previous process"));
		await runtime.background[0];
		await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
		expect(td.explain(runtime.health).callCount).toBe(2);
	},
);

it("should discard a health response that arrives after the startup deadline", async () => {
	vi.useFakeTimers();
	const runtime = _setup();
	const health = Promise.withResolvers<Response>();
	td.when(runtime.health()).thenReturn(health.promise, Promise.resolve(new Response(null, { status: 200 })));
	const result = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(20000);
	const response = await result;
	const late = new Response("late health");
	if (late.body === null) throw new Error("Expected a health body.");
	const cancel = vi.spyOn(late.body, "cancel");
	health.resolve(late);
	await vi.advanceTimersByTimeAsync(0);
	expect({
		status: response.status,
		cancelled: cancel.mock.calls.length,
		forwards: td.explain(runtime.forward).callCount,
	}).toEqual({ status: 503, cancelled: 1, forwards: 0 });
});

it.each(["success", "failure"] as const)(
	"should observe health body cancellation %s after the startup deadline",
	async (outcome) => {
		vi.useFakeTimers();
		const runtime = _setup();
		const health = new Response("health");
		if (health.body === null) throw new Error("Expected a health body.");
		td.replace(health.body, "cancel");
		td.when(health.body.cancel()).thenDo((): Promise<void> => {
			vi.advanceTimersByTime(20000);
			return outcome === "success"
				? Promise.resolve()
				: Promise.reject(new Error("Cancellation failed after deadline"));
		});
		td.when(runtime.health()).thenResolve(health, new Response(null, { status: 200 }));
		const response = await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
		expect({ status: response.status, forwards: td.explain(runtime.forward).callCount }).toEqual({
			status: 503,
			forwards: 0,
		});
	},
);

it("should allocate again if the API process stops during its health check", async () => {
	vi.useFakeTimers();
	const runtime = _setup();
	let attempts = 0;
	td.when(runtime.health()).thenDo(async (): Promise<Response> => {
		if (attempts++ === 0) runtime.container.running = false;
		return new Response(null, { status: 200 });
	});
	const result = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(300);
	await result;
	expect(td.explain(runtime.container.start).callCount).toBe(2);
});

it.each([null, new Error("private details"), { exitCode: "private details" }])(
	"should omit unavailable numeric exit status from process failure logs %j",
	async (failure) => {
		const runtime = _setup();
		await runtime.api.fetch(new Request("http://localhost/v1/jobs"));
		runtime.exit.reject(failure);
		await Promise.all(runtime.background);
		expect(td.explain(console.error).calls.map((call) => call.args)).toContainEqual([
			{ event: "api.container.stopped" },
		]);
	},
);

it("should absorb cancellation failure from a discarded late health body", async () => {
	vi.useFakeTimers();
	const runtime = _setup();
	const health = Promise.withResolvers<Response>();
	td.when(runtime.health()).thenReturn(health.promise, Promise.resolve(new Response(null, { status: 200 })));
	const result = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(20000);
	await result;
	const late = new Response("late health");
	if (late.body === null) throw new Error("Expected a health body.");
	const cancel = td.replace(late.body, "cancel");
	td.when(cancel()).thenReject(new Error("connection closed"));
	health.resolve(late);
	await vi.advanceTimersByTimeAsync(0);
	expect(td.explain(cancel).callCount).toBe(1);
});

it("should retain the startup diagnostic event without logging provider error details", async () => {
	vi.useFakeTimers();
	const runtime = _setup({
		beforeStart: () => {
			throw new Error("private infrastructure details");
		},
	});
	const response = runtime.api.fetch(new Request("http://localhost/v1/jobs"));
	await vi.advanceTimersByTimeAsync(20000);
	await response;
	expect(td.explain(console.error).calls.map((call) => call.args)).toContainEqual([
		{
			event: "api.container.start.failed",
			diagnosticEvent: "api.application.start.failed",
		},
	]);
});
