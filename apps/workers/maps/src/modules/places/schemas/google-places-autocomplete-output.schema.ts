import { z } from "zod";

export const GooglePlacesAutocompleteOutputSchema = z.strictObject({
	suggestions: z
		.array(
			z.strictObject({
				placePrediction: z.strictObject({
					placeId: z.string().min(1),
					text: z.strictObject({ text: z.string().min(1) }),
					types: z.array(z.string().min(1)).optional(),
					structuredFormat: z.strictObject({
						mainText: z.strictObject({ text: z.string().min(1) }),
						secondaryText: z.strictObject({ text: z.string().min(1) }).optional(),
					}),
				}),
			}),
		)
		.optional(),
});
