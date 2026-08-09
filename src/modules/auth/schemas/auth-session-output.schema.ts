import { z } from "zod";

export const AuthSessionOutputSchema = z
	.object({
		accessToken: z
			.string()
			.regex(/^[A-Za-z0-9_-]{43}$/)
			.describe("Opaque bearer token. It is shown only in this response."),
		tokenType: z.literal("Bearer"),
		expiresAt: z.iso.datetime(),
		refreshToken: z
			.string()
			.min(1)
			.max(512)
			.describe("Rotating opaque refresh token. Store it in platform secure storage."),
		refreshExpiresAt: z.iso.datetime(),
		userId: z.uuid(),
	})
	.strict()
	.meta({ id: "AuthSessionOutput" });
