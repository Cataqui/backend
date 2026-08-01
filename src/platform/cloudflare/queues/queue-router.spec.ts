const handleMock = vi.hoisted(() => vi.fn());

vi.mock("./derive-job-data/derive-job-data.queue-handler", () => ({
	DeriveJobDataHandler: { handle: handleMock },
}));

import { DeriveJobDataQueueConstants } from "./derive-job-data/derive-job-data-queue.constants";
import { QueueRouter } from "./queue-router";

describe("QueueRouter", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		handleMock.mockReset();
	});

	it.each([
		DeriveJobDataQueueConstants.BASE_NAME,
		`${DeriveJobDataQueueConstants.BASE_NAME}-staging`,
		`${DeriveJobDataQueueConstants.BASE_NAME}-production`,
	])("should route %s to the derive job data handler", async (queue) => {
		const batch = { queue: queue, messages: [] } as never;
		const env = {} as never;
		const context = {} as never;

		await QueueRouter.route({ batch: batch, env: env, context: context });

		expect(handleMock).toHaveBeenCalledWith({ batch: batch, env: env, context: context });
	});

	it("should retry every message from an unregistered queue", async () => {
		const retryAll = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await QueueRouter.route({
			batch: {
				queue: `${DeriveJobDataQueueConstants.BASE_NAME}-preview`,
				messages: [],
				retryAll: retryAll,
			} as never,
			env: {} as never,
			context: {} as never,
		});

		expect(retryAll).toHaveBeenCalledOnce();
	});

	it("should not call a registered handler for an unregistered queue", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await QueueRouter.route({
			batch: { queue: "unknown-queue", messages: [], retryAll: vi.fn() } as never,
			env: {} as never,
			context: {} as never,
		});

		expect(handleMock).not.toHaveBeenCalled();
	});
});
