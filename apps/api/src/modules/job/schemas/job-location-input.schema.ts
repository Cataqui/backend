import { z } from "zod";

export const JobLocationInputSchema = z
	.object({
		latitude: z.number().min(-90).max(90).describe("Exact latitude of the job location"),
		longitude: z.number().min(-180).max(180).describe("Exact longitude of the job location"),
	})
	.strict()
	.meta({ id: "JobLocationInput" });
