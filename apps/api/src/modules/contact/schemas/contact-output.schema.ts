import { z } from "zod";
import { ContactMethod } from "../../../../generated/prisma/client.js";

export const ContactOutputSchema = z
	.object({
		contactMethod: z.enum(ContactMethod).describe("Preferred contact method"),
		identifier: z
			.string()
			.describe("Contact identifier such as a phone number, username etc. Varies by contact method."),
	})
	.strict()
	.meta({ id: "ContactOutput" });
