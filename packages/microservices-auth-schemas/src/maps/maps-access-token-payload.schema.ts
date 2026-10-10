import { z } from "zod";
import { MapsAccessTokenConstants } from "./maps-access-token.constants.js";

export const MapsAccessTokenPayloadSchema = z
	.strictObject({
		aud: z.literal(MapsAccessTokenConstants.AUDIENCE),
		exp: z.int(),
		iat: z.int(),
		sub: z.uuid(),
	})
	.superRefine((claims, context) => {
		if (claims.exp - claims.iat === MapsAccessTokenConstants.LIFETIME_SECONDS) return;

		context.addIssue({
			code: "custom",
			message: "Microservice access tokens must use the fixed lifetime",
			path: ["exp"],
		});
	});
