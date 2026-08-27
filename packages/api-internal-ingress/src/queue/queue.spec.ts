import { routeQueueBatch } from "./queue";

function _buildQueueMessage(params: { body: unknown }) {
	return {
		id: "queue-message-id",
		timestamp: new Date(),
		attempts: 1,
		body: params.body,
		ack: vi.fn(),
		retry: vi.fn(),
	};
}

describe("routeQueueBatch", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	it.each(["development", "staging", "production"] as const)(
		"should deliver derive-job-data messages in %s",
		async (environment) => {
			const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
			const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

			await routeQueueBatch({
				batch: { queue: `cataqui-api-derive-job-data-${environment}`, messages: [message] } as never,
				environment: environment,
				deliver: deliver,
			});

			expect(deliver).toHaveBeenCalledOnce();
		},
	);

	it("should deliver derive-job-data messages as JSON to the configured internal endpoint", async () => {
		const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: deliver,
		});

		expect(deliver).toHaveBeenCalledWith({
			url: "http://localhost/internal/inbound/derive-job-data",
			requestOptions: {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(message.body),
			},
		});
	});

	it("should normalize derive-job-data messages queued before the camelCase rollout", async () => {
		const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const message = _buildQueueMessage({ body: { job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: deliver,
		});

		expect(JSON.parse(deliver.mock.calls[0]?.[0]?.requestOptions.body as string)).toEqual({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});
	});

	it("should acknowledge a successfully delivered message", async () => {
		const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
		});

		expect(message.ack).toHaveBeenCalledOnce();
	});

	it("should retry a message rejected by its Queue schema", async () => {
		const message = _buildQueueMessage({ body: { jobId: "not-a-uuid" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn(),
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should log an invalid Queue payload without exporting its message identifier", async () => {
		const message = _buildQueueMessage({ body: { jobId: "not-a-uuid" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn(),
		});
		const loggedFields = vi.mocked(console.error).mock.calls[0]?.[0];

		expect({ loggedFields: loggedFields, leakedMessageId: JSON.stringify(loggedFields).includes(message.id) }).toEqual({
			loggedFields: {
				event: "queue.message.invalid",
				queue: "cataqui-api-derive-job-data-development",
			},
			leakedMessageId: false,
		});
	});

	it("should retry a message when the internal endpoint rejects delivery", async () => {
		const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should log a rejected Queue delivery without exporting its message identifier", async () => {
		const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
		});
		const loggedFields = vi.mocked(console.error).mock.calls[0]?.[0];

		expect({ loggedFields: loggedFields, leakedMessageId: JSON.stringify(loggedFields).includes(message.id) }).toEqual({
			loggedFields: {
				event: "queue.delivery.failed",
				queue: "cataqui-api-derive-job-data-development",
				responseStatus: 500,
			},
			leakedMessageId: false,
		});
	});

	it("should retry a message when container transport fails", async () => {
		const message = _buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-development", messages: [message] } as never,
			environment: "development",
			deliver: vi.fn().mockRejectedValue(new Error("container unavailable")),
		});

		expect(message.retry).toHaveBeenCalledOnce();
	});

	it("should retry every message from an unregistered Queue", async () => {
		const retryAll = vi.fn();

		await routeQueueBatch({
			batch: { queue: "unknown-queue-development", messages: [], retryAll: retryAll } as never,
			environment: "development",
			deliver: vi.fn(),
		});

		expect(retryAll).toHaveBeenCalledOnce();
	});

	it("should not deliver a Queue belonging to another environment", async () => {
		const deliver = vi.fn();

		await routeQueueBatch({
			batch: { queue: "cataqui-api-derive-job-data-staging", messages: [], retryAll: vi.fn() } as never,
			environment: "production",
			deliver: deliver,
		});

		expect(deliver).not.toHaveBeenCalled();
	});
});
