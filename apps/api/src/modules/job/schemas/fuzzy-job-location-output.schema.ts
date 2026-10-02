import { z } from "zod";

export const FuzzyJobLocationOutputSchema = z
	.strictObject({
		latitude: z.number().min(-90).max(90).describe("Fuzzy public latitude, never the exact job location"),
		longitude: z.number().min(-180).max(180).describe("Fuzzy public longitude, never the exact job location"),
		areaRadius: z.number().describe("Radius in meters clients should draw around the fuzzy location"),
		imageUrl: z
			.url({ protocol: /^https$/ })
			.describe(
				"Base location image URL. Append size=480x480 or size=480x1280; scale defaults to 2 and zoom to 13. Unavailable variants return 404.",
			),
	})
	.meta({ id: "FuzzyJobLocationOutput" });
