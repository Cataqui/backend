import { z } from "zod";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export const JobContactReferenceOutputSchema = z
	.object({
		contactId: z.uuid().describe("Id of the job contact to fetch full details from"),
		contactMethod: z.enum(JobContactMethod).describe("Preferred contact method"),
	})
	.strict()
	.meta({ id: "JobContactReferenceOutput" });
