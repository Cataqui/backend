import { z } from "zod";

export const FuzzyJobLocationOutputSchema = z
	.strictObject({
		latitude: z.number().min(-90).max(90).describe("Fuzzy public latitude, never the exact job location"),
		longitude: z.number().min(-180).max(180).describe("Fuzzy public longitude, never the exact job location"),
		areaRadius: z.number().describe("Radius in meters clients should draw around the fuzzy location"),
		imageUrl: z.url({ protocol: /^https$/ }).describe("Map image showing the fuzzy job location"),
	})
	.meta({ id: "FuzzyJobLocationOutput" });
