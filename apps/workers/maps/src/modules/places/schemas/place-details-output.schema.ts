import { z } from "zod";

export const PlaceDetailsOutputSchema = z.strictObject({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

export type PlaceDetailsOutput = z.infer<typeof PlaceDetailsOutputSchema>;
