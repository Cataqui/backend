import { z } from "zod";

export const RefreshTokenInputSchema = z
	.object({
		refreshToken: z
			.string({ error: "refreshToken must be the opaque string returned by Cataquí" })
			.min(1, "refreshToken must not be empty")
			.max(512, "refreshToken must contain at most 512 characters")
			.describe("The opaque refresh token returned by authentication or refresh."),
	})
	.strict()
	.meta({ id: "RefreshTokenInput" });
