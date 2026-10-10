import { z } from "zod";
import { PlaceCategory } from "../place-category";

export const PlaceAreaSearchOutputSchema = z.array(
	z.strictObject({
		name: z.string().min(1),
		category: z.enum(PlaceCategory),
		coordinates: z.strictObject({
			latitude: z.number().min(-90).max(90),
			longitude: z.number().min(-180).max(180),
		}),
		notable: z.boolean(),
		brand: z.string().optional(),
	}),
);

export type PlaceAreaSearchOutput = z.infer<typeof PlaceAreaSearchOutputSchema>;
