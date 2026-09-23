import { z } from "zod";

export const GetJobContactInputSchema = z
	.object({
		jobId: z.uuid().describe("Id of the job offering the contact."),
		contactId: z.uuid().describe("Id of the contact referenced by that job."),
	})
	.strict()
	.meta({ id: "GetJobContactInput" });
