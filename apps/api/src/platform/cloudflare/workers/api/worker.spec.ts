const getRandomMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	ContainerProxy: class {},
	getRandom: getRandomMock,
}));

vi.mock("cloudflare:workers", () => ({
	WorkerEntrypoint: class {
		protected env: unknown;

		constructor(_context: unknown, environment: unknown) {
			this.env = environment;
		}
	},
}));

vi.mock("@cataqui/api-internal-ingress/queue", () => ({
	routeQueueBatch: routeMock,
}));

import worker, { ApiContainerInboundEntrypoint, MicroservicesAuthJwksEntrypoint } from "./worker";

function _createExecutionContext(params?: { jwksFetch?: ReturnType<typeof vi.fn> }): ExecutionContext {
	return {
		exports: {
			MicroservicesAuthJwksEntrypoint: {
				fetch: params?.jwksFetch ?? vi.fn(),
			},
		},
	} as never;
}

function _createApiWorkerEnvironment(params: { overrides?: Partial<ApiWorkerEnv> } = {}): ApiWorkerEnv {
	return {
		API_CONTAINER: {} as ApiWorkerEnv["API_CONTAINER"],
		API_CONTAINER_POOL_SIZE: "3",
		NODE_ENV: "staging",
		WORKER_VERSION_METADATA: {
			id: "worker-version-id",
			tag: "0123456789abcdef0123456789abcdef01234567",
			timestamp: "2026-08-27T12:00:00.000Z",
		},
		...(params.overrides ?? {}),
	} as ApiWorkerEnv;
}

describe("API Worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		getRandomMock.mockReset();
		routeMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should forward every public request without intercepting provider webhooks", async () => {
		const expectedResponse = new Response("api response");
		getRandomMock.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(expectedResponse) });

		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/whatsapp/webhook", { method: "POST" }),
			_createApiWorkerEnvironment(),
			_createExecutionContext(),
		);

		expect(await response.text()).toBe("api response");
	});

	it("should forward public requests to a random API container", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		getRandomMock.mockResolvedValue({ fetch: containerFetch });
		const env = _createApiWorkerEnvironment({ overrides: { API_CONTAINER_POOL_SIZE: "10" } });

		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/jobs/drafts", { method: "POST" }),
			env,
			_createExecutionContext(),
		);

		expect(await response.text()).toBe("ok");
	});

	it("should select a public-request container from the configured pool size", async () => {
		getRandomMock.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(new Response("ok")) });
		const apiContainerBinding = {};
		const env = _createApiWorkerEnvironment({
			overrides: { API_CONTAINER: apiContainerBinding as never, API_CONTAINER_POOL_SIZE: "10" },
		});

		await worker.fetch(new Request("https://api.cataqui.com/v1/feed"), env, _createExecutionContext());

		expect(getRandomMock).toHaveBeenCalledWith(apiContainerBinding, 10);
	});

	it("should dispatch only the public JWKS GET route through the cached entrypoint", async () => {
		const expectedResponse = Response.json({ keys: [] });
		const jwksFetch = vi.fn().mockResolvedValue(expectedResponse);
		const request = new Request("https://api.cataqui.com/v1/auth/microservices/jwks");

		const response = await worker.fetch(
			request,
			_createApiWorkerEnvironment({ overrides: { API_CONTAINER_POOL_SIZE: "10" } }),
			_createExecutionContext({ jwksFetch: jwksFetch }),
		);

		expect({
			responseBody: await response.text(),
			entrypointCalls: jwksFetch.mock.calls,
			containerCalls: getRandomMock.mock.calls,
		}).toEqual({
			responseBody: JSON.stringify({ keys: [] }),
			entrypointCalls: [[expect.any(Request)]],
			containerCalls: [],
		});
	});

	it.each([
		new Request("https://api.cataqui.com/v1/auth/microservices/jwks", { method: "POST" }),
		new Request("https://api.cataqui.com/v1/auth/microservices/jwks/another"),
	])("should keep non-matching requests on the uncached gateway", async (request) => {
		const containerFetch = vi.fn().mockResolvedValue(new Response("ok"));
		const jwksFetch = vi.fn();
		getRandomMock.mockResolvedValue({ fetch: containerFetch });

		await worker.fetch(
			request,
			_createApiWorkerEnvironment({ overrides: { API_CONTAINER_POOL_SIZE: "10" } }),
			_createExecutionContext({ jwksFetch: jwksFetch }),
		);

		expect({ entrypointCalls: jwksFetch.mock.calls, containerCalls: containerFetch.mock.calls.length }).toEqual({
			entrypointCalls: [],
			containerCalls: 1,
		});
	});

	it("should forward a cached-entrypoint miss to a random API container", async () => {
		const expectedResponse = Response.json({ keys: [] });
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		const apiContainerBinding = {};
		getRandomMock.mockResolvedValue({ fetch: containerFetch });
		const entrypoint = new MicroservicesAuthJwksEntrypoint(
			{} as never,
			_createApiWorkerEnvironment({ overrides: { API_CONTAINER: apiContainerBinding as never } }),
		);
		const request = new Request("https://api.cataqui.com/v1/auth/microservices/jwks");

		const response = await entrypoint.fetch(request);

		expect({
			response: response,
			selectedPool: getRandomMock.mock.calls,
			containerCalls: containerFetch.mock.calls,
		}).toEqual({
			response: expectedResponse,
			selectedPool: [[apiContainerBinding, 3]],
			containerCalls: [[request]],
		});
	});

	it("should prevent a failed JWKS response from entering the Worker cache", async () => {
		getRandomMock.mockResolvedValue({
			fetch: vi.fn().mockResolvedValue(new Response("failed", { status: 503, headers: { "Cache-Control": "public" } })),
		});
		const entrypoint = new MicroservicesAuthJwksEntrypoint({} as never, _createApiWorkerEnvironment());

		const response = await entrypoint.fetch(new Request("https://api.cataqui.com/v1/auth/microservices/jwks"));

		expect({
			status: response.status,
			cacheControl: response.headers.get("Cache-Control"),
			body: await response.text(),
		}).toEqual({
			status: 503,
			cacheControl: "no-store",
			body: "failed",
		});
	});

	it("should delegate queue batches to the queue router", async () => {
		const batch = { queue: "cataqui-api-derive-job-data", messages: [] } as never;
		const env = _createApiWorkerEnvironment({ overrides: { NODE_ENV: "development" } });
		routeMock.mockResolvedValue({
			acknowledgedMessageCount: 0,
			invalidMessageCount: 0,
			retriedMessageCount: 0,
		});

		await worker.queue(batch, env);

		expect(routeMock).toHaveBeenCalledWith({
			batch: batch,
			environment: "development",
			deliver: expect.any(Function),
		});
	});

	it("should select a random API container when the Queue router requests delivery", async () => {
		const apiContainerBinding = {};
		const env = _createApiWorkerEnvironment({
			overrides: {
				API_CONTAINER: apiContainerBinding as never,
				API_CONTAINER_POOL_SIZE: "10",
				NODE_ENV: "production",
			},
		});
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandomMock.mockResolvedValue({ containerFetch: containerFetch });
		routeMock.mockImplementation(async ({ deliver }) => {
			await deliver({ url: "http://localhost/internal/example", requestOptions: { method: "POST" } });
			return { acknowledgedMessageCount: 0, invalidMessageCount: 0, retriedMessageCount: 0 };
		});

		await worker.queue({ queue: "cataqui-api-derive-job-data", messages: [] } as never, env);

		expect(getRandomMock).toHaveBeenCalledWith(apiContainerBinding, 10);
	});

	it("should pass the Queue router request to the selected API container", async () => {
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandomMock.mockResolvedValue({ containerFetch: containerFetch });
		routeMock.mockImplementation(async ({ deliver }) => {
			await deliver({
				url: "http://localhost/internal/example",
				requestOptions: { method: "POST" },
			});
			return { acknowledgedMessageCount: 0, invalidMessageCount: 0, retriedMessageCount: 0 };
		});

		await worker.queue(
			{ queue: "cataqui-api-derive-job-data", messages: [] } as never,
			_createApiWorkerEnvironment({
				overrides: { API_CONTAINER_POOL_SIZE: "10", NODE_ENV: "production" },
			}),
		);

		const deliveryOptions = containerFetch.mock.calls[0]?.[1] as RequestInit;
		expect({
			method: deliveryOptions.method,
			requestId: new Headers(deliveryOptions.headers).get("x-request-id"),
			url: containerFetch.mock.calls[0]?.[0],
		}).toEqual({
			method: "POST",
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			url: "http://localhost/internal/example",
		});
	});

	it("should deliver a valid WhatsApp NOTP message directly to a random API container", async () => {
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const apiContainerBinding = {};
		getRandomMock.mockResolvedValue({ containerFetch: containerFetch });
		const entrypoint = new ApiContainerInboundEntrypoint(
			{} as never,
			_createApiWorkerEnvironment({ overrides: { API_CONTAINER: apiContainerBinding as never } }),
		);
		const message = {
			providerMessageId: "wamid.message",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		};

		await entrypoint.deliverInbound({ receiver: "verify-whatsapp-notp", body: message });

		const deliveryOptions = containerFetch.mock.calls[0]?.[1] as RequestInit;
		expect({
			body: deliveryOptions.body,
			containerSelectionCalls: getRandomMock.mock.calls,
			contentType: new Headers(deliveryOptions.headers).get("content-type"),
			method: deliveryOptions.method,
			requestId: new Headers(deliveryOptions.headers).get("x-request-id"),
			url: containerFetch.mock.calls[0]?.[0],
		}).toEqual({
			body: JSON.stringify(message),
			containerSelectionCalls: [[apiContainerBinding, 3]],
			contentType: "application/json",
			method: "POST",
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			url: "http://localhost/internal/inbound/verify-whatsapp-notp",
		});
	});

	it("should reject an invalid direct WhatsApp NOTP message before selecting a container", async () => {
		const entrypoint = new ApiContainerInboundEntrypoint({} as never, _createApiWorkerEnvironment());

		const response = await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-notp",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				notpCodeHash: "plaintext-code",
			},
		});

		expect(response.status).toBe(400);
	});

	it("should return the container rejection to the calling Webhooks Worker", async () => {
		getRandomMock.mockResolvedValue({
			containerFetch: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
		});
		const entrypoint = new ApiContainerInboundEntrypoint({} as never, _createApiWorkerEnvironment());

		const response = await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-notp",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
			},
		});

		expect(response.status).toBe(500);
	});

	it("should replace untrusted trace headers with one request identifier shared by the container and response", async () => {
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandomMock.mockResolvedValue({ fetch: containerFetch });

		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/feed", {
				headers: {
					baggage: "private-baggage",
					traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
					tracestate: "private=state",
				},
			}),
			_createApiWorkerEnvironment(),
			_createExecutionContext(),
		);
		const forwardedRequest = containerFetch.mock.calls[0]?.[0] as Request;
		const requestId = response.headers.get("x-request-id");

		expect({
			forwardedBaggage: forwardedRequest.headers.get("baggage"),
			forwardedRequestId: forwardedRequest.headers.get("x-request-id"),
			forwardedTraceparent: forwardedRequest.headers.get("traceparent"),
			forwardedTracestate: forwardedRequest.headers.get("tracestate"),
			requestId: requestId,
		}).toEqual({
			forwardedBaggage: null,
			forwardedRequestId: requestId,
			forwardedTraceparent: null,
			forwardedTracestate: null,
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
		});
	});

	it.each([
		{ event: "api.worker.request.completed", logMethod: "warn", outcome: "CLIENT_REJECTED", responseStatus: 404 },
		{ event: "api.worker.request.rejected", logMethod: "error", outcome: "REJECTED", responseStatus: 503 },
	] as const)("should emit a bounded $event lifecycle record", async (testCase) => {
		getRandomMock.mockResolvedValue({
			fetch: vi.fn().mockResolvedValue(new Response(null, { status: testCase.responseStatus })),
		});
		const environment = _createApiWorkerEnvironment({
			overrides: {
				WORKER_VERSION_METADATA: {
					id: "worker-version-id",
					tag: "",
					timestamp: "2026-08-27T12:00:00.000Z",
				},
			},
		});

		await worker.fetch(new Request("https://api.cataqui.com/v1/feed"), environment, _createExecutionContext());

		expect(vi.mocked(console[testCase.logMethod]).mock.calls[0]?.[0]).toEqual({
			durationMilliseconds: expect.any(Number),
			env: "staging",
			event: testCase.event,
			method: "GET",
			outcome: testCase.outcome,
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			responseStatus: testCase.responseStatus,
			service: "cataqui-api-staging",
			version: "worker-version-id",
		});
	});

	it("should log a safe public handoff failure before preserving the Worker error", async () => {
		const handoffFailure = new Error("private container details");
		getRandomMock.mockRejectedValue(handoffFailure);

		const error = await worker
			.fetch(new Request("https://api.cataqui.com/v1/feed"), _createApiWorkerEnvironment(), _createExecutionContext())
			.catch((caught: unknown) => caught);

		expect({
			error: error,
			leaksPrivateDetails: JSON.stringify(vi.mocked(console.error).mock.calls).includes("private container details"),
			log: vi.mocked(console.error).mock.calls[0]?.[0],
		}).toEqual({
			error: handoffFailure,
			leaksPrivateDetails: false,
			log: expect.objectContaining({
				errorName: "Error",
				errorStackFrames: expect.stringContaining("worker.spec.ts"),
				event: "api.worker.request.failed",
				outcome: "THREW",
				responseStatus: 500,
			}),
		});
	});

	it("should emit a correlated successful direct-inbound lifecycle record", async () => {
		getRandomMock.mockResolvedValue({
			containerFetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
		});
		const entrypoint = new ApiContainerInboundEntrypoint({} as never, _createApiWorkerEnvironment());

		const response = await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-notp",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
			},
		});

		expect({
			log: vi.mocked(console.log).mock.calls[0]?.[0],
			responseRequestId: response.headers.get("x-request-id"),
		}).toEqual({
			log: expect.objectContaining({
				event: "api.worker.inbound.call.completed",
				outcome: "SUCCESS",
				receiver: "verify-whatsapp-notp",
				requestId: response.headers.get("x-request-id"),
				responseStatus: 204,
			}),
			responseRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
		});
	});

	it("should emit the bounded direct-inbound rejection lifecycle", async () => {
		const entrypoint = new ApiContainerInboundEntrypoint({} as never, _createApiWorkerEnvironment());

		await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-notp",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				notpCodeHash: "plaintext-code",
			},
		});

		expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				event: "api.worker.inbound.call.rejected",
				outcome: "REJECTED",
				receiver: "verify-whatsapp-notp",
				responseStatus: 400,
			}),
		);
	});

	it("should log a safe direct-inbound transport failure before preserving it", async () => {
		const transportFailure = new Error("private Durable Object details");
		getRandomMock.mockRejectedValue(transportFailure);
		const entrypoint = new ApiContainerInboundEntrypoint({} as never, _createApiWorkerEnvironment());

		const error = await entrypoint
			.deliverInbound({
				receiver: "verify-whatsapp-notp",
				body: {
					providerMessageId: "wamid.message",
					providerSenderId: "provider-sender-id",
					providerContactIdentifier: "+5511999999999",
					notpCodeHash: "a".repeat(64),
				},
			})
			.catch((caught: unknown) => caught);

		expect({ error: error, log: vi.mocked(console.error).mock.calls[0]?.[0] }).toEqual({
			error: transportFailure,
			log: expect.objectContaining({
				errorName: "Error",
				event: "api.worker.inbound.call.failed",
				outcome: "THREW",
				receiver: "verify-whatsapp-notp",
			}),
		});
	});

	it.each([
		{ event: "api.worker.queue.delivery.completed", outcome: "SUCCESS", responseStatus: 204 },
		{ event: "api.worker.queue.delivery.rejected", outcome: "REJECTED", responseStatus: 503 },
	] as const)("should emit a bounded $event lifecycle record", async (testCase) => {
		getRandomMock.mockResolvedValue({
			containerFetch: vi.fn().mockResolvedValue(new Response(null, { status: testCase.responseStatus })),
		});
		routeMock.mockImplementation(async ({ deliver }) => {
			await deliver({ url: "http://localhost/internal/example", requestOptions: { method: "POST" } });
			return {
				acknowledgedMessageCount: testCase.responseStatus === 204 ? 1 : 0,
				invalidMessageCount: 0,
				retriedMessageCount: testCase.responseStatus === 204 ? 0 : 1,
			};
		});

		await worker.queue(
			{ queue: "cataqui-api-derive-job-data-staging", messages: [{}] } as never,
			_createApiWorkerEnvironment(),
		);

		const logMethod = testCase.responseStatus >= 500 ? "error" : "log";
		expect(vi.mocked(console[logMethod]).mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				event: testCase.event,
				outcome: testCase.outcome,
				queue: "cataqui-api-derive-job-data-staging",
				responseStatus: testCase.responseStatus,
			}),
		);
	});

	it("should emit a retry-scheduled Queue batch summary", async () => {
		routeMock.mockResolvedValue({
			acknowledgedMessageCount: 1,
			invalidMessageCount: 1,
			retriedMessageCount: 2,
		});

		await worker.queue(
			{ queue: "cataqui-api-derive-job-data-staging", messages: [{}, {}, {}] } as never,
			_createApiWorkerEnvironment(),
		);

		expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toEqual({
			acknowledgedMessageCount: 1,
			durationMilliseconds: expect.any(Number),
			env: "staging",
			event: "api.worker.queue.batch.completed",
			invalidMessageCount: 1,
			messageCount: 3,
			outcome: "RETRY_SCHEDULED",
			queue: "cataqui-api-derive-job-data-staging",
			retriedMessageCount: 2,
			service: "cataqui-api-staging",
			version: "0123456789abcdef0123456789abcdef01234567",
		});
	});

	it("should log a safe Queue delivery and batch failure before preserving it", async () => {
		const deliveryFailure = new Error("private Queue delivery details");
		getRandomMock.mockRejectedValue(deliveryFailure);
		routeMock.mockImplementation(async ({ deliver }) => {
			await deliver({ url: "http://localhost/internal/example", requestOptions: { method: "POST" } });
		});

		const error = await worker
			.queue({ queue: "cataqui-api-derive-job-data-staging", messages: [{}] } as never, _createApiWorkerEnvironment())
			.catch((caught: unknown) => caught);

		expect({
			error: error,
			leaksPrivateDetails: JSON.stringify(vi.mocked(console.error).mock.calls).includes(
				"private Queue delivery details",
			),
			logs: vi.mocked(console.error).mock.calls.map((call) => call[0]),
		}).toEqual({
			error: deliveryFailure,
			leaksPrivateDetails: false,
			logs: [
				expect.objectContaining({ event: "api.worker.queue.delivery.failed", outcome: "THREW" }),
				expect.objectContaining({ event: "api.worker.queue.batch.failed", outcome: "THREW" }),
			],
		});
	});
});
