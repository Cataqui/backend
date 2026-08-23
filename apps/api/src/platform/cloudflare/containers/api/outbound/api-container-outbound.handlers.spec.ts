import { apiContainerOutboundHandlers } from "./api-container-outbound.handlers";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("API container outbound handlers", () => {
	it("should reject methods other than POST", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "GET" }),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn() } } as never,
			{} as never,
		);

		expect(response.status).toBe(405);
	});

	it("should identify POST as the allowed method", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "GET" }),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn() } } as never,
			{} as never,
		);

		expect(response.headers.get("Allow")).toBe("POST");
	});

	it("should reject malformed JSON", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "POST", body: "not-json" }),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn() } } as never,
			{} as never,
		);

		expect(response.status).toBe(400);
	});

	it.each([
		["a primitive", "value"],
		["null", null],
		["an array", []],
		["a missing job ID", {}],
		["a non-string job ID", { jobId: 42 }],
		["an invalid job UUID", { jobId: "not-a-uuid" }],
	])("should reject %s", async (_scenario, requestBody) => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify(requestBody),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn() } } as never,
			{} as never,
		);

		expect(response.status).toBe(400);
	});

	it("should publish a validated request through the generated Queue binding", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify({ jobId: jobId }),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: send } } as never,
			{} as never,
		);

		expect(send).toHaveBeenCalledWith({ jobId: jobId });
	});

	it("should normalize outbound requests from containers running the previous image", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify({ job_id: jobId }),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: send } } as never,
			{} as never,
		);

		expect(send).toHaveBeenCalledWith({ jobId: jobId });
	});

	it("should return no content after executing the registered outbound operation", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify({ jobId: jobId }),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } } as never,
			{} as never,
		);

		expect(response.status).toBe(204);
	});

	it("should return unavailable when the registered outbound operation fails", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify({ jobId: jobId }),
			}),
			{
				DERIVE_JOB_DATA_QUEUE: {
					send: vi.fn().mockRejectedValue(new Error("queue unavailable")),
				},
			} as never,
			{} as never,
		);

		expect(response.status).toBe(503);
	});
});
