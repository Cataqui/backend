import { z } from "zod";

export const FeedLocationOutputSchema = z
	.object({
		latitude: z
			.number()
			.describe(
				"Fuzzy public latitude of the location to show on map. Note that this is not the exact location of the job but an estimation",
			),
		longitude: z
			.number()
			.describe(
				"Fuzzy public longitude of the location to show on map. Note that this is not the exact location of the job but an estimation",
			),
		areaRadius: z
			.number()
			.describe(
				"Radius in meters clients should draw around the fuzzy location to show where is the job located as estimation.",
			),
	})
	.strict()
	.meta({ id: "FeedLocationOutput" });
