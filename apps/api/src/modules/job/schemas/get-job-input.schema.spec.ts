import type { z } from "zod";
import { GetJobInputSchema } from "./get-job-input.schema";

async function validate(value: unknown): Promise<Array<{ property: string }>> {
	const result = GetJobInputSchema.safeParse(value);
	return result.success ? [] : result.error.issues.map((issue) => ({ property: String(issue.path[0] ?? "") }));
}

describe("GetJobInputSchema", () => {
	describe("jobId validation", () => {
		function createInput(
			overrides: Partial<z.infer<typeof GetJobInputSchema>> = {},
		): z.infer<typeof GetJobInputSchema> {
			const defaults: z.infer<typeof GetJobInputSchema> = {
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			};
			return Object.assign({}, defaults, overrides);
		}

		it("should accept a valid UUID", async () => {
			const dto = createInput();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string", async () => {
			const dto = createInput({ jobId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});

		it("should reject an empty string", async () => {
			const dto = createInput({ jobId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});
	});
});
