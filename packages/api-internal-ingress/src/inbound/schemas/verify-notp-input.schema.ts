import { z } from "zod";

export const VerifyNotpInputSchema = z
	.object({
		providerMessageId: z.string().min(1).max(512),
		providerSenderId: z.string().min(1).max(512),
		providerContactIdentifier: z.string().min(1).max(320),
		providerProfileName: z.string().max(320).optional(),
		notpCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
