import { z } from "zod";
import { PlaceCategory } from "../place-category.enum";

export const PlaceSearchOutputSchema = z.strictObject({
	suggestions: z.array(
		z.strictObject({
			placeId: z.string().min(1),
			fullText: z.string().min(1),
			primaryText: z.string().min(1),
			secondaryText: z.string().min(1).nullable(),
			category: z.enum(PlaceCategory),
		}),
	),
	attribution: z.strictObject({
		text: z.string().min(1),
	}),
});

export type PlaceSearchOutput = z.infer<typeof PlaceSearchOutputSchema>;
