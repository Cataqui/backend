const getContainerMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	ContainerProxy: class {},
	getContainer: getContainerMock,
}));

vi.mock("./queues/queue-router", () => ({
	QueueRouter: { route: routeMock },
}));

import { DeriveJobDataQueueConstants } from "./queues/derive-job-data/derive-job-data-queue.constants";
import worker from "./index";

describe("API Worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		getContainerMock.mockReset();
		routeMock.mockReset();
	});

	it("should forward public requests directly to the API container", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		getContainerMock.mockReturnValue({ fetch: containerFetch });

		const response = await worker.fetch(new Request("https://api.cataqui.com/v1/job/draft", { method: "POST" }), {
			API_CONTAINER: {},
		} as never);

		expect(response).toBe(expectedResponse);
	});

	it("should delegate queue batches to the queue router", async () => {
		const batch = { queue: DeriveJobDataQueueConstants.BASE_NAME, messages: [] } as never;
		const env = { API_CONTAINER: {} } as never;
		const context = {} as never;

		await worker.queue(batch, env, context);

		expect(routeMock).toHaveBeenCalledWith({ batch: batch, env: env, context: context });
	});
});
