import { z } from "zod";

export const StaticImageDeliveryInputSchema = z
	.strictObject({
		image: z
			.string()
			.max(4101)
			.regex(/^[A-Za-z0-9_-]+\.webp$/)
			.describe("Worker-signed public fuzzy location reference followed by .webp, returned by private Maps RPC."),
	})
	.transform((input) => ({ reference: input.image.slice(0, -5) }));
export type StaticImageDeliveryInput = z.output<typeof StaticImageDeliveryInputSchema>;
