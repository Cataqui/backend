import { z } from "zod";
import { ContactMethod } from "../../../../generated/prisma/client";

export const SavedContactOutputSchema = z
	.object({
		contactId: z.uuid().describe("Unique identifier of the saved contact"),
		method: z.enum(ContactMethod).describe("Contact method available for future job posts"),
		identifier: z.string().describe("Phone number or WhatsApp username saved for future job posts"),
	})
	.strict()
	.meta({ id: "SavedContactOutput" });
