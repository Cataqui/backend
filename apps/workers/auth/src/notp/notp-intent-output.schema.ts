import { z } from "zod";

export const NotpIntentOutputSchema = z
	.object({
		intentToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		code: z.string().regex(/^NOTP-[A-Z0-9]{10}$/),
		codeReceiver: z.string().min(1),
		expiresAt: z.iso.datetime(),
	})
	.strict()
	.meta({ id: "NotpIntentOutput" });
