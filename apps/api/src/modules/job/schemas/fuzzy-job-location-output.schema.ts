import { z } from "zod";

export const FuzzyJobLocationOutputSchema = z
	.strictObject({
		latitude: z.number().min(-90).max(90).describe("Fuzzy public latitude, never the exact job location"),
		longitude: z.number().min(-180).max(180).describe("Fuzzy public longitude, never the exact job location"),
		areaRadius: z.number().describe("Radius in meters clients should draw around the fuzzy location"),
		image: z
			.strictObject({
				accessToken: z
					.string()
					.min(1)
					.describe(
						"Signed permission to request geographic images for these fuzzy coordinates. Send as Authorization: Bearer to Geoimage. It has no expiration and does not authenticate a user.",
					),
			})
			.describe(
				"Permission for geographic images of this location; Geoimage owns the supported sizes and densities. Cached images are publicly accessible.",
			),
	})
	.meta({ id: "FuzzyJobLocationOutput" });
