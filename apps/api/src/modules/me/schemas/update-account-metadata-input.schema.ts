import { z } from "zod";

export const UpdateAccountMetadataInputSchema = z
	.strictObject({
		onboardingCompleted: z
			.boolean({ error: "onboardingCompleted must be a boolean: true or false." })
			.optional()
			.describe("Set whether onboarding is complete. Omit this field to keep its current value."),
	})
	.meta({ id: "UpdateAccountMetadataInput" });
