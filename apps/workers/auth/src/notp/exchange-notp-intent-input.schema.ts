import { z } from "zod";

export const ExchangeNotpIntentInputSchema = z
	.object({ intentToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
	.strict()
	.meta({ id: "ExchangeNotpIntentInput" });
