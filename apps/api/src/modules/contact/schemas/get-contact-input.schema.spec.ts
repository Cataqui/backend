import type { z } from "zod";
import { GetContactInputSchema } from "./get-contact-input.schema";

async function validate(value: unknown): Promise<Array<{ property: string }>> {
	const result = GetContactInputSchema.safeParse(value);
	return result.success ? [] : result.error.issues.map((issue) => ({ property: String(issue.path[0] ?? "") }));
}

describe("GetContactInputSchema", () => {
	function createInput(
		overrides: Partial<z.infer<typeof GetContactInputSchema>> = {},
	): z.infer<typeof GetContactInputSchema> {
		const defaults: z.infer<typeof GetContactInputSchema> = {
			contactId: "b1c2d3e4-5678-4abc-8def-1234567890ab",
		};
		return Object.assign({}, defaults, overrides);
	}

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
