import { z } from "zod";

export const UserJobLocationOutputSchema = z
	.object({
		title: z.string().describe("Selected display title for the job location"),
		latitude: z.number().describe("Fuzzy public latitude of the job location"),
		longitude: z.number().describe("Fuzzy public longitude of the job location"),
		areaRadius: z.number().describe("Radius in meters to draw around the fuzzy location"),
	})
	.strict()
	.meta({ id: "UserJobLocationOutput" });
