const getRandomMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	ContainerProxy: class {},
	getRandom: getRandomMock,
}));

vi.mock("../../queues/queue", () => ({
	routeQueueBatch: routeMock,
}));

import worker from "./worker";

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
		);

		expect(response).toBe(expectedResponse);
	});

	it("should forward public requests to a random API container", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		getRandomMock.mockResolvedValue({ fetch: containerFetch });
		const env = { API_CONTAINER: {}, API_CONTAINER_POOL_SIZE: "10" } as never;

		const response = await worker.fetch(new Request("https://api.cataqui.com/v1/jobs/drafts", { method: "POST" }), env);

		expect(response).toBe(expectedResponse);
	});

	it("should select a public-request container from the configured pool size", async () => {
		getRandomMock.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(new Response("ok")) });
		const apiContainerBinding = {};
		const env = { API_CONTAINER: apiContainerBinding, API_CONTAINER_POOL_SIZE: "10" } as never;

		await worker.fetch(new Request("https://api.cataqui.com/v1/feed"), env);

		expect(getRandomMock).toHaveBeenCalledWith(apiContainerBinding, 10);
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
});
