import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DeriveJobDataQueueConstants } from "../../platform/cloudflare/queues/derive-job-data/derive-job-data-queue.constants";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("DeriveJobDataPublisher", () => {
	let publisher: DeriveJobDataPublisher;

	beforeEach(async () => {
		vi.restoreAllMocks();
		const module = await Test.createTestingModule({ providers: [DeriveJobDataPublisher] }).compile();
		publisher = module.get(DeriveJobDataPublisher);
	});

	it("should publish only the job UUID through the container binding host", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await publisher.publish({ jobId: jobId });

		expect(fetchMock).toHaveBeenCalledWith(`http://${DeriveJobDataQueueConstants.OUTBOUND_HOST}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ job_id: jobId }),
		});
	});

	it("should not fail draft creation when the queue host returns an error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await expect(publisher.publish({ jobId: jobId })).resolves.toBeUndefined();
	});

	it("should log an unsuccessful queue response without a description or response body", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private body", { status: 503 })));
		const loggerError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await publisher.publish({ jobId: jobId });

		expect(loggerError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_publish_failed",
			jobId: jobId,
			status: 503,
		});
	});

	it("should not fail draft creation when the queue host cannot be reached", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("queue host unavailable")));
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await expect(publisher.publish({ jobId: jobId })).resolves.toBeUndefined();
	});

	it("should log queue transport failures without their potentially sensitive error details", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private transport details")));
		const loggerError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await publisher.publish({ jobId: jobId });

		expect(loggerError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_publish_failed",
			jobId: jobId,
			status: null,
		});
	});
});
