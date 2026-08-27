import { trace } from "@opentelemetry/api";
import { Logger } from "@nestjs/common";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { registerHttpObservabilityHooks } from "./http-observability.hook";

function _createObservabilityServiceMock() {
	return {
		addActiveHttpRequests: vi.fn(),
		recordHttpRequestCompleted: vi.fn(),
		recordHttpRequestTerminated: vi.fn(),
	};
}

function _createHookRegistrationHarness() {
	const registeredHooks = new Map<string, (...args: unknown[]) => Promise<void>>();
	const fastifyInstance = {
		addHook: vi.fn((hookName: string, hook: (...args: unknown[]) => Promise<void>) => {
			registeredHooks.set(hookName, hook);
		}),
	} as unknown as FastifyInstance;

	return { fastifyInstance: fastifyInstance, registeredHooks: registeredHooks };
}

describe("registerHttpObservabilityHooks", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should record a normalized route template instead of a concrete resource ID", async () => {
		const app = Fastify();
		const observabilityService = _createObservabilityServiceMock();
		registerHttpObservabilityHooks({ fastifyInstance: app, observabilityService: observabilityService as never });
		app.get("/v1/jobs/:jobId", async () => ({ ok: true }));

		await app.inject({ method: "GET", url: "/v1/jobs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
		await app.close();

		expect(observabilityService.recordHttpRequestCompleted).toHaveBeenCalledWith({
			durationSeconds: expect.any(Number),
			method: "GET",
			route: "/v1/jobs/:jobId",
			statusCode: 200,
		});
	});

	it("should count requests rejected before they reach a controller", async () => {
		const app = Fastify();
		const observabilityService = _createObservabilityServiceMock();
		registerHttpObservabilityHooks({ fastifyInstance: app, observabilityService: observabilityService as never });
		app.addHook("onRequest", async (_request, reply) => reply.status(413).send());

		await app.inject({ method: "POST", url: "/v1/jobs/drafts" });
		await app.close();

		expect(observabilityService.recordHttpRequestCompleted).toHaveBeenCalledWith({
			durationSeconds: expect.any(Number),
			method: "POST",
			route: "UNMATCHED",
			statusCode: 413,
		});
	});

	it("should preserve a bounded caller request ID on the response", async () => {
		const app = Fastify();
		registerHttpObservabilityHooks({
			fastifyInstance: app,
			observabilityService: _createObservabilityServiceMock() as never,
		});
		app.get("/v1/health", async () => ({ ok: true }));

		const response = await app.inject({
			method: "GET",
			url: "/v1/health",
			headers: { "x-request-id": "mobile-request-123" },
		});
		await app.close();

		expect(response.headers["x-request-id"]).toBe("mobile-request-123");
	});

	it("should replace an unbounded caller request ID before correlation", async () => {
		const app = Fastify();
		registerHttpObservabilityHooks({
			fastifyInstance: app,
			observabilityService: _createObservabilityServiceMock() as never,
		});
		app.get("/v1/health", async () => ({ ok: true }));

		const response = await app.inject({
			method: "GET",
			url: "/v1/health",
			headers: { "x-request-id": "x".repeat(129) },
		});
		await app.close();

		expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("should attach the bounded request ID to the active request span", async () => {
		const setAttribute = vi.fn();
		const activeSpanSpy = vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttribute: setAttribute,
			setAttributes: vi.fn(),
			updateName: vi.fn(),
		} as never);
		const app = Fastify();
		registerHttpObservabilityHooks({
			fastifyInstance: app,
			observabilityService: _createObservabilityServiceMock() as never,
		});
		app.get("/v1/health", async () => ({ ok: true }));

		await app.inject({ method: "GET", url: "/v1/health", headers: { "x-request-id": "mobile-request-123" } });
		await app.close();
		activeSpanSpy.mockRestore();

		expect(setAttribute).toHaveBeenCalledWith("cataqui.request.id", "mobile-request-123");
	});

	it("should balance the active request gauge after a response", async () => {
		const app = Fastify();
		const observabilityService = _createObservabilityServiceMock();
		registerHttpObservabilityHooks({ fastifyInstance: app, observabilityService: observabilityService as never });
		app.get("/v1/health", async () => ({ ok: true }));

		await app.inject({ method: "GET", url: "/v1/health" });
		await app.close();

		expect(observabilityService.addActiveHttpRequests.mock.calls).toEqual([
			[{ delta: 1, route: "/v1/health" }],
			[{ delta: -1, route: "/v1/health" }],
		]);
	});

	it.each([
		{ terminalHookName: "onRequestAbort", terminationReason: HttpRequestTerminationReason.ABORTED },
		{ terminalHookName: "onTimeout", terminationReason: HttpRequestTerminationReason.TIMEOUT },
	] as const)(
		"should record a bounded $terminationReason outcome when $terminalHookName terminates the request",
		async ({ terminalHookName, terminationReason }) => {
			vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
			const { fastifyInstance, registeredHooks } = _createHookRegistrationHarness();
			const observabilityService = _createObservabilityServiceMock();
			registerHttpObservabilityHooks({
				fastifyInstance: fastifyInstance,
				observabilityService: observabilityService as never,
			});
			const request = { headers: {}, method: "GET", raw: {}, url: "/v1/feed" } as FastifyRequest;
			const reply = { header: vi.fn() } as unknown as FastifyReply;

			await registeredHooks.get("onRequest")?.(request, reply);
			await registeredHooks.get(terminalHookName)?.(request, reply);

			expect({
				activeRequestCalls: observabilityService.addActiveHttpRequests.mock.calls,
				completedRequestCalls: observabilityService.recordHttpRequestCompleted.mock.calls,
				terminatedRequestCall: observabilityService.recordHttpRequestTerminated.mock.calls[0]?.[0],
			}).toEqual({
				activeRequestCalls: [[{ delta: 1, route: "UNMATCHED" }], [{ delta: -1, route: "UNMATCHED" }]],
				completedRequestCalls: [],
				terminatedRequestCall: {
					durationSeconds: expect.any(Number),
					method: "GET",
					route: "UNMATCHED",
					terminationReason: terminationReason,
				},
			});
		},
	);

	it("should decrement the active request gauge only once when a timeout is followed by a response", async () => {
		vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		const { fastifyInstance, registeredHooks } = _createHookRegistrationHarness();
		const observabilityService = _createObservabilityServiceMock();
		registerHttpObservabilityHooks({
			fastifyInstance: fastifyInstance,
			observabilityService: observabilityService as never,
		});
		const request = { headers: {}, method: "GET", raw: {}, url: "/v1/feed" } as FastifyRequest;
		const reply = { header: vi.fn(), statusCode: 504 } as unknown as FastifyReply;

		await registeredHooks.get("onRequest")?.(request, reply);
		await registeredHooks.get("onTimeout")?.(request, reply);
		await registeredHooks.get("onResponse")?.(request, reply);

		expect({
			activeRequestCalls: observabilityService.addActiveHttpRequests.mock.calls,
			completedRequestCallCount: observabilityService.recordHttpRequestCompleted.mock.calls.length,
			terminatedRequestCallCount: observabilityService.recordHttpRequestTerminated.mock.calls.length,
		}).toEqual({
			activeRequestCalls: [[{ delta: 1, route: "UNMATCHED" }], [{ delta: -1, route: "UNMATCHED" }]],
			completedRequestCallCount: 0,
			terminatedRequestCallCount: 1,
		});
	});
});
