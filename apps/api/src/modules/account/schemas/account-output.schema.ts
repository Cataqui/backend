import { z } from "zod";
import { AccountAdmission } from "../../../../generated/prisma/enums";

export const AccountOutputSchema = z
	.strictObject({
		id: z.uuid().describe("The authenticated account identifier"),
		admission: z.enum(AccountAdmission).describe("The current account access level"),
		onboardingCompleted: z.boolean().describe("Whether the authenticated user has completed onboarding"),
	})
	.meta({ id: "AccountOutput" });
