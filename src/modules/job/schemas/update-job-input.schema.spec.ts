import { JobType } from "../../../../generated/prisma/client.js";
import { UpdateJobInputSchema } from "./update-job-input.schema";

describe("UpdateJobInputSchema", () => {
	it("should accept one customer-editable field for a partial edit", () => {
		expect(UpdateJobInputSchema.safeParse({ description: "Nova descrição da oportunidade." }).success).toBe(true);
	});

	it("should reject a customer-supplied derived title", () => {
		expect(UpdateJobInputSchema.safeParse({ title: "Título manual" }).success).toBe(false);
	});

	it("should accept an empty no-op patch", () => {
		expect(UpdateJobInputSchema.safeParse({}).success).toBe(true);
	});

	it("should reject an invalid supplied field without requiring unrelated fields", () => {
		expect(UpdateJobInputSchema.safeParse({ type: "UNKNOWN" }).success).toBe(false);
	});

	it("should accept a valid supplied job type without requiring unrelated fields", () => {
		expect(UpdateJobInputSchema.safeParse({ type: JobType.CONTRACTOR }).success).toBe(true);
	});

	it("should reject an updated description containing only whitespace", () => {
		expect(UpdateJobInputSchema.safeParse({ description: " ".repeat(10) }).success).toBe(false);
	});

	it("should trim the accepted updated description before returning it", () => {
		expect(UpdateJobInputSchema.parse({ description: "  Nova descrição válida  " }).description).toBe(
			"Nova descrição válida",
		);
	});
});
