import { enqueueMessages, routeQueueBatch } from "./queue";

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

describe("enqueueMessages", () => {
	it("should enqueue every message", async () => {
		const send = vi.fn().mockResolvedValue({ metadata: { metrics: {} } });

		await enqueueMessages({ messages: ["first", "second"], queue: { send: send } as never });

		expect(send.mock.calls.map(([message]) => message)).toEqual(["first", "second"]);
	});

	it("should attempt every message when one Queue publication fails", async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error("Queue unavailable")).mockResolvedValueOnce({});

		await enqueueMessages({ messages: ["first", "second"], queue: { send: send } as never }).catch(() => undefined);

		expect(send).toHaveBeenCalledTimes(2);
	});

	it("should throw when any Queue publication fails", async () => {
		await expect(
			enqueueMessages({
				messages: ["message"],
				queue: { send: vi.fn().mockRejectedValue(new Error("Queue unavailable")) } as never,
			}),
		).rejects.toThrow("One or more messages could not be queued");
	});
});

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

	it.each(["development", "staging", "production"] as const)(
		"should deliver WhatsApp-auth messages in %s",
		async (environment) => {
			const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
			const message = _buildQueueMessage({
				body: {
					providerMessageId: "wamid.message",
					providerSenderId: "5511999999999",
					providerContactIdentifier: "+5511999999999",
					authCodeHash: "a".repeat(64),
				},
			});

			await routeQueueBatch({
				batch: { queue: `cataqui-api-verify-whatsapp-auth-message-${environment}`, messages: [message] } as never,
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
			url: "http://localhost/internal/queues/cataqui-api-derive-job-data",
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

	it("should deliver WhatsApp-auth messages as JSON to the configured internal endpoint", async () => {
		const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const message = _buildQueueMessage({
			body: {
				providerContactIdentifier: "+5511999999999",
				providerMessageId: "wamid.message",
				providerSenderId: "5511999999999",
				authCodeHash: "a".repeat(64),
			},
		});

		await routeQueueBatch({
			batch: { queue: "cataqui-api-verify-whatsapp-auth-message-development", messages: [message] } as never,
			environment: "development",
			deliver: deliver,
		});

		expect({
			url: deliver.mock.calls[0]?.[0]?.url,
			method: deliver.mock.calls[0]?.[0]?.requestOptions.method,
			headers: deliver.mock.calls[0]?.[0]?.requestOptions.headers,
			body: JSON.parse(deliver.mock.calls[0]?.[0]?.requestOptions.body as string),
		}).toEqual({
			url: "http://localhost/internal/queues/cataqui-api-verify-whatsapp-auth-message",
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: message.body,
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

	it("should not deliver a message rejected by its Queue schema", async () => {
		const deliver = vi.fn();

		await routeQueueBatch({
			batch: {
				queue: "cataqui-api-verify-whatsapp-auth-message-development",
				messages: [_buildQueueMessage({ body: { type: "unsupported" } })],
			} as never,
			environment: "development",
			deliver: deliver,
		});

		expect(deliver).not.toHaveBeenCalled();
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

	it("should not attempt a legacy endpoint when the registered endpoint is not found", async () => {
		const deliver = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

		await routeQueueBatch({
			batch: {
				queue: "cataqui-api-derive-job-data-development",
				messages: [_buildQueueMessage({ body: { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } })],
			} as never,
			environment: "development",
			deliver: deliver,
		});

		expect(deliver).toHaveBeenCalledOnce();
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
			batch: {
				queue: "cataqui-api-verify-whatsapp-auth-message-staging",
				messages: [],
				retryAll: vi.fn(),
			} as never,
			environment: "production",
			deliver: deliver,
		});

		expect(deliver).not.toHaveBeenCalled();
	});
});
