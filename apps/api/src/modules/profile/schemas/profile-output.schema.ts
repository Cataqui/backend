import { z } from "zod";

export const ProfileOutputSchema = z
	.object({
		profileId: z.uuid().describe("Profile identifier, equal to the authenticated account identifier."),
		name: z.string().min(1).max(320).describe("Name supplied during onboarding."),
	})
	.strict()
	.meta({ id: "ProfileOutput" });
