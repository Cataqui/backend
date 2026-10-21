import { z } from "zod";

export const GooglePlacesDetailsOutputSchema = z.strictObject({
	location: z.strictObject({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
	}),
});
