import { z } from "zod";

export const GeoapifyConfigSchema = z.strictObject({
	apiKey: z.string().regex(/\S/),
});
