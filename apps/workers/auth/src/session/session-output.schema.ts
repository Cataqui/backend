import { z } from "zod";

export const SessionOutputSchema = z
	.object({
		accessToken: z
			.string()
			.regex(/^[A-Za-z0-9_-]{43}$/)
			.describe("Opaque bearer token. Store it securely; it is returned only when issued."),
		tokenType: z.literal("Bearer"),
		expiresAt: z.iso.datetime(),
		refreshToken: z.string().min(1).max(512).describe("Rotating refresh token. Store it in platform secure storage."),
		refreshExpiresAt: z.iso.datetime(),
		accountId: z.uuid(),
	})
	.strict()
	.meta({ id: "SessionOutput" });
