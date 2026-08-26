import { z } from "zod";

export const GetJobContactInputSchema = z
	.object({
		jobId: z.uuid().describe("Id of the job that owns the contact."),
		contactId: z.uuid().describe("Id of the contact to fetch."),
	})
	.strict()
	.meta({ id: "GetJobContactInput" });
