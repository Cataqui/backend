import { z } from "zod";

export const MicroserviceAccessTokenPayloadSchema = z
	.object({
		aud: z.literal("GEOSEARCH"),
		exp: z.int(),
		iat: z.int(),
		sub: z.uuid(),
	})
	.strict();
