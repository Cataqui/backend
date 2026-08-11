import { z } from "zod";

export const GetJobInputSchema = z
	.object({ jobId: z.uuid().describe("Id of the job to be fetched.") })
	.strict()
	.meta({ id: "GetJobInput" });
