const getContainerMock = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	getContainer: getContainerMock,
}));

import { DeriveJobDataHandler } from "./derive-job-data.queue-handler";
import { DeriveJobDataQueueConstants } from "./derive-job-data-queue.constants";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function _createQueueMessage(params: { body?: unknown } = {}): {
	id: string;
	body: unknown;
	ack: ReturnType<typeof vi.fn>;
	retry: ReturnType<typeof vi.fn>;
} {
	return {
		id: "message-id",
		body: "body" in params ? params.body : { job_id: jobId },
		ack: vi.fn(),
		retry: vi.fn(),
	};
}

describe("DeriveJobDataHandler", () => {
	let containerInternalFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.restoreAllMocks();
		getContainerMock.mockReset();
		containerInternalFetch = vi.fn();
		getContainerMock.mockReturnValue({ containerFetch: containerInternalFetch });
	});

	it("should acknowledge successful internal derivation", async () => {
		containerInternalFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const message = _createQueueMessage();

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(message.ack).toHaveBeenCalledOnce();
	});

	it("should not retry successful internal derivation", async () => {
		containerInternalFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const message = _createQueueMessage();

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(message.retry).not.toHaveBeenCalled();
	});

	it("should call the exact binding-only job data derivation endpoint", async () => {
		containerInternalFetch.mockResolvedValue(new Response(null, { status: 204 }));
		const message = _createQueueMessage();

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(containerInternalFetch).toHaveBeenCalledWith(
			`http://localhost/internal/job/${jobId}/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`,
			{
				method: "POST",
			},
		);
	});

	it("should retry non-successful internal derivation responses", async () => {
		containerInternalFetch.mockResolvedValue(new Response(null, { status: 503 }));
		const message = _createQueueMessage();
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should retain the response status in unsuccessful derivation logs", async () => {
		containerInternalFetch.mockResolvedValue(new Response(null, { status: 503 }));
		const message = _createQueueMessage();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(consoleError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_consume_failed",
			jobId: jobId,
			status: 503,
		});
	});

	it("should retry internal derivation transport failures", async () => {
		containerInternalFetch.mockRejectedValue(new Error("container unavailable"));
		const message = _createQueueMessage();
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should log null status for internal derivation transport failures", async () => {
		containerInternalFetch.mockRejectedValue(new Error("private transport details"));
		const message = _createQueueMessage();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(consoleError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_consume_failed",
			jobId: jobId,
			status: null,
		});
	});

	it("should retry malformed messages", async () => {
		const message = _createQueueMessage({ body: { job_id: "not-a-uuid" } });
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should not call the container for malformed messages", async () => {
		const message = _createQueueMessage({ body: null });
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		await DeriveJobDataHandler.handle({
			batch: { messages: [message] } as never,
			env: { API_CONTAINER: {} } as never,
			context: {} as never,
		});

		expect(containerInternalFetch).not.toHaveBeenCalled();
	});
});
