import { CreateJobDraftInputSchema } from "./create-job-draft-input.schema";

describe("CreateJobDraftInputSchema", () => {
	it("should accept descriptions at the minimum supported length", () => {
		expect(CreateJobDraftInputSchema.safeParse({ description: "1234567890" }).success).toBe(true);
	});

	it("should reject descriptions shorter than ten characters", () => {
		expect(CreateJobDraftInputSchema.safeParse({ description: "short" }).success).toBe(false);
	});

	it("should reject descriptions containing only whitespace", () => {
		expect(CreateJobDraftInputSchema.safeParse({ description: " ".repeat(10) }).success).toBe(false);
	});

	it("should trim the accepted description before returning it", () => {
		expect(CreateJobDraftInputSchema.parse({ description: "  Vaga de cozinha  " }).description).toBe("Vaga de cozinha");
	});

	it("should reject descriptions longer than ten thousand characters", () => {
		expect(CreateJobDraftInputSchema.safeParse({ description: "a".repeat(10_001) }).success).toBe(false);
	});
});
