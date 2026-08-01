import { DeriveJobDataMessageSchema } from "./derive-job-data-message.schema";

describe("DeriveJobDataMessageSchema", () => {
	it("should accept every field required to derive job data", () => {
		const result = DeriveJobDataMessageSchema.safeParse({
			job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(result.success).toBe(true);
	});

	it("should reject a message without the job ID", () => {
		const result = DeriveJobDataMessageSchema.safeParse({});

		expect(result.success).toBe(false);
	});

	it("should reject a job ID that is not a UUID", () => {
		const result = DeriveJobDataMessageSchema.safeParse({ job_id: "not-a-uuid" });

		expect(result.success).toBe(false);
	});

	it("should reject fields outside the derive job data message contract", () => {
		const result = DeriveJobDataMessageSchema.safeParse({
			job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			description: "Private description",
		});

		expect(result.success).toBe(false);
	});
});
