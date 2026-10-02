import { z } from "zod";

export const GenerateStaticMapsInputSchema = z.strictObject({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

export type GenerateStaticMapsInput = z.output<typeof GenerateStaticMapsInputSchema>;
