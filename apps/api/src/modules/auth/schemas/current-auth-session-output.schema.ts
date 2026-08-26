import { z } from "zod";

export const CurrentAuthSessionOutputSchema = z
	.object({
		sessionId: z.uuid(),
		userId: z.uuid(),
		expiresAt: z.iso.datetime(),
	})
	.strict()
	.meta({ id: "CurrentAuthSessionOutput" });
