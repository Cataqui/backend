import type { z } from "zod";
import { GetJobInputSchema } from "./get-job-input.schema";

function _getJobInputValidationErrors(value: unknown): Array<{ property: string }> {
	const result = GetJobInputSchema.safeParse(value);
	return result.success ? [] : result.error.issues.map((issue) => ({ property: String(issue.path[0] ?? "") }));
}

describe("GetJobInputSchema", () => {
	describe("jobId validation", () => {
		function _createJobInput(
			overrides: Partial<z.infer<typeof GetJobInputSchema>> = {},
		): z.infer<typeof GetJobInputSchema> {
			const defaults: z.infer<typeof GetJobInputSchema> = {
				jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			};
			return Object.assign({}, defaults, overrides);
		}

		it("should accept a valid UUID", () => {
			const dto = _createJobInput();

			const errors = _getJobInputValidationErrors(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID job identifier", () => {
			const dto = _createJobInput({ jobId: "not-a-uuid" });

			const errors = _getJobInputValidationErrors(dto);

			expect(errors).toHaveLength(1);
		});

		it("should identify jobId when a non-UUID value is rejected", () => {
			const dto = _createJobInput({ jobId: "not-a-uuid" });

			const errors = _getJobInputValidationErrors(dto);

			expect(errors[0]?.property).toBe("jobId");
		});

		it("should reject an empty job identifier", () => {
			const dto = _createJobInput({ jobId: "" });

			const errors = _getJobInputValidationErrors(dto);

			expect(errors).toHaveLength(1);
		});

		it("should identify jobId when an empty value is rejected", () => {
			const dto = _createJobInput({ jobId: "" });

			const errors = _getJobInputValidationErrors(dto);

			expect(errors[0]?.property).toBe("jobId");
		});
	});
});
