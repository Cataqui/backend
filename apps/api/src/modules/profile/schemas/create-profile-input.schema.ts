import { z } from "zod";
import { ContactInputSchema } from "../../contact/schemas/contact-input.schema";

export const CreateProfileInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, { error: "name must contain at least one non-whitespace character" })
			.max(320)
			.describe("Profile name shown in Cataquí; between 1 and 320 characters after trimming."),
		initialContacts: z
			.array(ContactInputSchema)
			.describe(
				"Initial contact methods selected during onboarding. An empty list is allowed. These are contact details, not proof of ownership.",
			),
	})
	.strict()
	.meta({ id: "CreateProfileInput" });
