import { z } from "zod";
import { NotpIntentStatus } from "../enums/notp-intent-status.enum";

export const NotpIntentPendingOutputSchema = z
	.object({
		status: z.literal(NotpIntentStatus.PENDING),
		retryAfterSeconds: z.int().positive(),
	})
	.strict()
	.meta({ id: "NotpIntentPendingOutput" });
