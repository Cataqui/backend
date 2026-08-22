import { z } from "zod";

export const MicroserviceAccessTokenOutputSchema = z
	.object({
		accessToken: z.string().min(1).max(2_048).describe("Short-lived bearer token for the requested microservice."),
		expiresAt: z.iso.datetime(),
		tokenType: z.literal("Bearer"),
	})
	.strict()
	.meta({ id: "MicroserviceAccessTokenOutput" });
