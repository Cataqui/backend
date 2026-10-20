import { z } from "zod";

export const AuthenticatedSessionOutputSchema = z
	.object({
		accountId: z.uuid(),
		sessionId: z.uuid(),
		expiresAt: z.iso.datetime(),
	})
	.strict()
	.meta({ id: "AuthenticatedSessionOutput" });

export type AuthenticatedSession = z.output<typeof AuthenticatedSessionOutputSchema>;
