import { z } from "zod";
import { InboundMessageAuthIntentStatus } from "../enums/inbound-message-auth-intent-status.enum";

export const AuthIntentPendingOutputSchema = z
	.object({
		status: z.literal(InboundMessageAuthIntentStatus.PENDING),
		retryAfterSeconds: z.int().positive(),
	})
	.strict()
	.meta({ id: "AuthIntentPendingOutput" });
