import { z } from "zod";

export const AccountMetadataOutputSchema = z
	.strictObject({
		onboardingCompleted: z.boolean().describe("Whether the authenticated user has completed onboarding"),
	})
	.meta({ id: "AccountMetadataOutput" });
