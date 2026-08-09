import { DeriveJobDataQueueMessageSchema } from "./derive-job-data-queue-message.schema";

describe("DeriveJobDataInputSchema", () => {
	it("should accept every field required to derive job data", () => {
		const result = DeriveJobDataQueueMessageSchema.safeParse({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(result.success).toBe(true);
	});

	it("should normalize a queued message created before the camelCase rollout", () => {
		const result = DeriveJobDataQueueMessageSchema.parse({
			job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(result).toEqual({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
	});

	it("should reject a message without the job ID", () => {
		const result = DeriveJobDataQueueMessageSchema.safeParse({});

		expect(result.success).toBe(false);
	});

	it("should reject a job ID that is not a UUID", () => {
		const result = DeriveJobDataQueueMessageSchema.safeParse({ jobId: "not-a-uuid" });

		expect(result.success).toBe(false);
	});

	it("should reject fields outside the derive job data message contract", () => {
		const result = DeriveJobDataQueueMessageSchema.safeParse({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			description: "Private description",
		});

		expect(result.success).toBe(false);
	});
});
