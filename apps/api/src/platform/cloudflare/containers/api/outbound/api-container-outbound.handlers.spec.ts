import { apiContainerOutboundHandlers } from "./api-container-outbound.handlers";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function _createApiWorkerEnvironment(params: {
	environment?: "development" | "production" | "staging";
	send: ReturnType<typeof vi.fn>;
	serviceVersion?: string;
}): ApiWorkerEnv {
	return {
		DERIVE_JOB_DATA_QUEUE: { send: params.send },
		NODE_ENV: params.environment ?? "staging",
		WORKER_VERSION_METADATA: {
			id: "api-worker-version-id",
			tag: params.serviceVersion ?? "0123456789abcdef0123456789abcdef01234567",
			timestamp: "2026-08-22T12:00:00.000Z",
		},
	} as never;
}

describe("API container outbound handlers", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should reject methods other than POST", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "GET" }),
			_createApiWorkerEnvironment({ send: vi.fn() }),
			{} as never,
		);

		expect({ responseStatus: response.status, warning: vi.mocked(console.warn).mock.calls[0]?.[0] }).toEqual({
			responseStatus: 405,
			warning: expect.objectContaining({
				event: "api.worker.outbound.call.rejected",
				outboundHost: "derive-job-data.queue",
				outcome: "REJECTED",
				responseStatus: 405,
			}),
		});
	});

	it("should identify POST as the allowed method", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "GET" }),
			_createApiWorkerEnvironment({ send: vi.fn() }),
			{} as never,
		);

		expect(response.headers.get("Allow")).toBe("POST");
	});

	it("should reject malformed JSON", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", { method: "POST", body: "not-json" }),
			_createApiWorkerEnvironment({ send: vi.fn() }),
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
			_createApiWorkerEnvironment({ send: vi.fn() }),
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
			_createApiWorkerEnvironment({ send: send }),
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
			_createApiWorkerEnvironment({ send: send }),
			{} as never,
		);

		expect(send).toHaveBeenCalledWith({ jobId: jobId });
	});

	it("should return no content after executing the registered outbound operation", async () => {
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				headers: { traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01" },
				body: JSON.stringify({ jobId: jobId }),
			}),
			_createApiWorkerEnvironment({
				environment: "staging",
				send: vi.fn().mockResolvedValue(undefined),
				serviceVersion: "0123456789abcdef0123456789abcdef01234567",
			}),
			{} as never,
		);

		expect({ responseStatus: response.status, writtenLog: vi.mocked(console.log).mock.calls[0]?.[0] }).toEqual({
			responseStatus: 204,
			writtenLog: {
				durationMilliseconds: expect.any(Number),
				env: "staging",
				event: "api.worker.outbound.call.completed",
				outboundHost: "derive-job-data.queue",
				outcome: "SUCCESS",
				responseStatus: 204,
				service: "cataqui-api-staging",
				trace_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				version: "0123456789abcdef0123456789abcdef01234567",
			},
		});
	});

	it("should return unavailable when the registered outbound operation fails", async () => {
		const queueFailure = new Error("provider response included a private queue token");
		const response = await apiContainerOutboundHandlers["derive-job-data.queue"](
			new Request("http://derive-job-data.queue", {
				method: "POST",
				body: JSON.stringify({ jobId: jobId }),
			}),
			_createApiWorkerEnvironment({
				environment: "staging",
				send: vi.fn().mockRejectedValue(queueFailure),
				serviceVersion: "0123456789abcdef0123456789abcdef01234567",
			}),
			{} as never,
		);

		expect({
			leaksPrivateQueueToken: JSON.stringify(vi.mocked(console.error).mock.calls).includes("private queue token"),
			responseStatus: response.status,
			writtenLog: vi.mocked(console.error).mock.calls[0]?.[0],
		}).toEqual({
			leaksPrivateQueueToken: false,
			responseStatus: 503,
			writtenLog: {
				durationMilliseconds: expect.any(Number),
				env: "staging",
				errorName: "Error",
				errorStackFrames: expect.stringContaining("api-container-outbound.handlers.spec.ts"),
				event: "api.worker.outbound.call.failed",
				outboundHost: "derive-job-data.queue",
				outcome: "THREW",
				responseStatus: 503,
				service: "cataqui-api-staging",
				version: "0123456789abcdef0123456789abcdef01234567",
			},
		});
	});
});
