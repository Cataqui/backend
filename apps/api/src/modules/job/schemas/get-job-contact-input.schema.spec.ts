import { GetJobContactInputSchema } from "./get-job-contact-input.schema";

describe("GetJobContactInputSchema", () => {
	it("accepts UUIDs for both the job and its contact", () => {
		expect(
			GetJobContactInputSchema.safeParse({
				jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(true);
	});

	it("rejects an invalid job ID", () => {
		expect(
			GetJobContactInputSchema.safeParse({ jobId: "bad", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }).success,
		).toBe(false);
	});

	it("rejects a missing contact ID", () => {
		expect(GetJobContactInputSchema.safeParse({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }).success).toBe(false);
	});
});
