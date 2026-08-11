import { z } from "zod";

export const JobLocationOutputSchema = z
	.object({
		neighborhood: z.string().describe("Neighborhood or district"),
		city: z.string().describe("City name"),
		state: z.string().describe("State code (2 chars)"),
		country: z.string().describe("Country code (ISO 3166-1 alpha-2)"),
		latitude: z
			.number()
			.describe(
				"Fuzzy public latitude of the location to show on map. Note that this is not the exact location but an estimation",
			),
		longitude: z
			.number()
			.describe(
				"Fuzzy public longitude of the location to show on map. Note that this is not the exact location but an estimation",
			),
		areaRadius: z.number().describe("Radius in meters clients should draw around the fuzzy location"),
	})
	.strict()
	.meta({ id: "JobLocationOutput" });
