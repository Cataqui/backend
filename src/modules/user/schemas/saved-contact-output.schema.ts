import { z } from "zod";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export const SavedContactOutputSchema = z
	.object({
		contactId: z.uuid().describe("Unique identifier of the saved contact"),
		contactMethod: z.enum(JobContactMethod).describe("Contact method available for future job posts"),
		identifier: z.string().describe("Phone number or WhatsApp username saved for future job posts"),
	})
	.strict()
	.meta({ id: "SavedContactOutput" });
