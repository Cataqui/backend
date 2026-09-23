import { z } from "zod";
import { ContactMethod } from "../../../../generated/prisma/client.js";

export const JobContactReferenceOutputSchema = z
	.object({
		contactId: z.uuid().describe("Id of the contact to fetch full details from"),
		method: z.enum(ContactMethod).describe("Preferred contact method"),
	})
	.strict()
	.meta({ id: "JobContactReferenceOutput" });
