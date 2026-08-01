import { DeriveJobDataQueueConstants } from "../../queues/derive-job-data/derive-job-data-queue.constants";
import { DeriveJobDataOutboundHandler } from "./derive-job-data.outbound-handler";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("DeriveJobDataOutboundHandler", () => {
	it("should enqueue a UUID-only derive job data message", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await DeriveJobDataOutboundHandler.publish(
			new Request(`http://${DeriveJobDataQueueConstants.OUTBOUND_HOST}`, {
				method: "POST",
				body: JSON.stringify({ job_id: jobId }),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: send } } as never,
		);

		expect(send).toHaveBeenCalledWith({ job_id: jobId });
	});

	it.each([
		["a primitive", "value"],
		["null", null],
		["an array", []],
		["a missing job ID", {}],
		["a non-string job ID", { job_id: 42 }],
		["an invalid job UUID", { job_id: "not-a-uuid" }],
	])("should reject %s", async (_scenario, requestBody) => {
		const response = await DeriveJobDataOutboundHandler.publish(
			new Request(`http://${DeriveJobDataQueueConstants.OUTBOUND_HOST}`, {
				method: "POST",
				body: JSON.stringify(requestBody),
			}),
			{ DERIVE_JOB_DATA_QUEUE: { send: vi.fn() } } as never,
		);

		expect(response.status).toBe(400);
	});
});
