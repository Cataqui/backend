import { z } from "zod";

export const GooglePlacesAutocompleteOutputSchema = z
	.object({
		suggestions: z
			.array(
				z
					.object({
						placePrediction: z
							.object({
								placeId: z.string().min(1),
								text: z.object({ text: z.string().min(1) }).strict(),
								structuredFormat: z
									.object({
										mainText: z.object({ text: z.string().min(1) }).strict(),
										secondaryText: z
											.object({ text: z.string().min(1) })
											.strict()
											.optional(),
									})
									.strict(),
							})
							.strict(),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();
