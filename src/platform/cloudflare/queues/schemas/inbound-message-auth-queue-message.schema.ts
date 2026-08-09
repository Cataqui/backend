import { z } from "zod";

export const InboundMessageAuthQueueMessageSchema = z
	.object({
		providerMessageId: z.string().min(1).max(512),
		providerSenderId: z.string().min(1).max(512),
		providerContactIdentifier: z.string().min(1).max(320),
		authCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
