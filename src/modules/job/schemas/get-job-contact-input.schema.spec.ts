import type { z } from "zod";
import { GetJobContactInputSchema } from "./get-job-contact-input.schema";

async function validate(value: unknown): Promise<Array<{ property: string }>> {
	const result = GetJobContactInputSchema.safeParse(value);
	return result.success ? [] : result.error.issues.map((issue) => ({ property: String(issue.path[0] ?? "") }));
}

describe("GetJobContactInputSchema", () => {
	function createInput(
		overrides: Partial<z.infer<typeof GetJobContactInputSchema>> = {},
	): z.infer<typeof GetJobContactInputSchema> {
		const defaults: z.infer<typeof GetJobContactInputSchema> = {
			jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			contactId: "b1c2d3e4-5678-4abc-8def-1234567890ab",
		};
		return Object.assign({}, defaults, overrides);
	}

	describe("jobId validation", () => {
		it("should accept a valid UUID", async () => {
			const dto = createInput();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string for jobId", async () => {
			const dto = createInput({ jobId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});

		it("should reject an empty jobId", async () => {
			const dto = createInput({ jobId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});
	});

	describe("contactId validation", () => {
		it("should accept a valid UUID", async () => {
			const dto = createInput();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string for contactId", async () => {
			const dto = createInput({ contactId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("contactId");
		});

		it("should reject an empty contactId", async () => {
			const dto = createInput({ contactId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("contactId");
		});
	});
});
