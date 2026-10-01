import { z } from "zod";
import { GeosearchAccessTokenConstants } from "./geosearch-access-token.constants.js";

export const GeosearchAccessTokenPayloadSchema = z
	.strictObject({
		aud: z.literal(GeosearchAccessTokenConstants.AUDIENCE),
		exp: z.int(),
		iat: z.int(),
		sub: z.uuid(),
	})
	.superRefine((claims, context) => {
		if (claims.exp - claims.iat === GeosearchAccessTokenConstants.LIFETIME_SECONDS) return;

		context.addIssue({
			code: "custom",
			message: "Microservice access tokens must use the fixed lifetime",
			path: ["exp"],
		});
	});
