import { z } from "zod";

export const GetStaticMapLocationUrlInputSchema = z.strictObject({
	latitude: z.number().min(-85.0511287798066).max(85.0511287798066),
	longitude: z.number().min(-180).max(180),
});

export type GetStaticMapLocationUrlInput = z.output<typeof GetStaticMapLocationUrlInputSchema>;
