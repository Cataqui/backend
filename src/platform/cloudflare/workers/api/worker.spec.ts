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

vi.mock("../../queues/queue", () => ({
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

describe("API Worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		getRandomMock.mockReset();
		routeMock.mockReset();
	});

	it("should forward every public request without intercepting provider webhooks", async () => {
		const expectedResponse = new Response("api response");
		getRandomMock.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(expectedResponse) });

		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/whatsapp/webhook", { method: "POST" }),
			{ API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "3" } as never,
			_createExecutionContext(),
		);

		expect(response).toBe(expectedResponse);
	});

	it("should forward public requests to a random API container", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		getRandomMock.mockResolvedValue({ fetch: containerFetch });
		const env = { API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "10" } as never;

		const response = await worker.fetch(
			new Request("https://api.cataqui.com/v1/jobs/drafts", { method: "POST" }),
			env,
			_createExecutionContext(),
		);

		expect(response).toBe(expectedResponse);
	});

	it("should select a public-request container from the configured pool size", async () => {
		getRandomMock.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(new Response("ok")) });
		const apiContainerBinding = {};
		const env = { API_CONTAINER: apiContainerBinding, API_CONTAINER_POOL_SIZE: "10" } as never;

		await worker.fetch(new Request("https://api.cataqui.com/v1/feed"), env, _createExecutionContext());

		expect(getRandomMock).toHaveBeenCalledWith(apiContainerBinding, 10);
	});

	it("should dispatch only the public JWKS GET route through the cached entrypoint", async () => {
		const expectedResponse = Response.json({ keys: [] });
		const jwksFetch = vi.fn().mockResolvedValue(expectedResponse);
		const request = new Request("https://api.cataqui.com/v1/auth/microservices/jwks");

		const response = await worker.fetch(
			request,
			{ API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "10" } as never,
			_createExecutionContext({ jwksFetch: jwksFetch }),
		);

		expect({
			response: response,
			entrypointCalls: jwksFetch.mock.calls,
			containerCalls: getRandomMock.mock.calls,
		}).toEqual({
			response: expectedResponse,
			entrypointCalls: [[request]],
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
			{ API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "10" } as never,
			_createExecutionContext({ jwksFetch: jwksFetch }),
		);

		expect({ entrypointCalls: jwksFetch.mock.calls, containerCalls: containerFetch.mock.calls }).toEqual({
			entrypointCalls: [],
			containerCalls: [[request]],
		});
	});

	it("should forward a cached-entrypoint miss to a random API container", async () => {
		const expectedResponse = Response.json({ keys: [] });
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		const apiContainerBinding = {};
		getRandomMock.mockResolvedValue({ fetch: containerFetch });
		const entrypoint = new MicroservicesAuthJwksEntrypoint(
			{} as never,
			{ API_CONTAINER: apiContainerBinding, API_CONTAINER_POOL_SIZE: "3" } as never,
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
		const entrypoint = new MicroservicesAuthJwksEntrypoint(
			{} as never,
			{ API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "3" } as never,
		);

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
		const env = { API_CONTAINER: {}, NODE_ENV: "development" } as never;

		await worker.queue(batch, env);

		expect(routeMock).toHaveBeenCalledWith({
			batch: batch,
			environment: "development",
			deliver: expect.any(Function),
		});
	});

	it("should select a random API container when the Queue router requests delivery", async () => {
		const apiContainerBinding = {};
		const env = {
			API_CONTAINER: apiContainerBinding,
			API_CONTAINER_POOL_SIZE: "10",
			NODE_ENV: "production",
		} as never;
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandomMock.mockResolvedValue({ containerFetch: containerFetch });
		routeMock.mockImplementation(async ({ deliver }) => {
			await deliver({ url: "http://localhost/internal/example", requestOptions: { method: "POST" } });
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
		});

		await worker.queue(
			{ queue: "cataqui-api-derive-job-data", messages: [] } as never,
			{ API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "10", NODE_ENV: "production" } as never,
		);

		expect(containerFetch).toHaveBeenCalledWith("http://localhost/internal/example", { method: "POST" });
	});

	it("should deliver a valid WhatsApp authentication message directly to a random API container", async () => {
		const containerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const apiContainerBinding = {};
		getRandomMock.mockResolvedValue({ containerFetch: containerFetch });
		const entrypoint = new ApiContainerInboundEntrypoint(
			{} as never,
			{
				API_CONTAINER: apiContainerBinding,
				API_CONTAINER_POOL_SIZE: "3",
			} as never,
		);
		const message = {
			providerMessageId: "wamid.message",
			providerSenderId: "provider-sender-id",
			providerContactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		};

		await entrypoint.deliverInbound({ receiver: "verify-whatsapp-auth-message", body: message });

		expect(getRandomMock).toHaveBeenCalledWith(apiContainerBinding, 3);
		expect(containerFetch).toHaveBeenCalledWith("http://localhost/internal/inbound/verify-whatsapp-auth-message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		});
	});

	it("should reject an invalid direct WhatsApp authentication message before selecting a container", async () => {
		const entrypoint = new ApiContainerInboundEntrypoint(
			{} as never,
			{
				API_CONTAINER: {},
				API_CONTAINER_POOL_SIZE: "3",
			} as never,
		);

		const response = await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-auth-message",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				authCodeHash: "plaintext-code",
			},
		});

		expect(response.status).toBe(400);
	});

	it("should return the container rejection to the calling Webhooks Worker", async () => {
		getRandomMock.mockResolvedValue({
			containerFetch: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
		});
		const entrypoint = new ApiContainerInboundEntrypoint(
			{} as never,
			{
				API_CONTAINER: {},
				API_CONTAINER_POOL_SIZE: "3",
			} as never,
		);

		const response = await entrypoint.deliverInbound({
			receiver: "verify-whatsapp-auth-message",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "provider-sender-id",
				providerContactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			},
		});

		expect(response.status).toBe(500);
	});
});
