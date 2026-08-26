import { z } from "zod";
import { MicroserviceAccessTokenConstants } from "../microservice-access-token.constants.js";
import { MicroserviceAudience } from "../microservice-audience.enum.js";

export const MicroserviceAccessTokenPayloadInputSchema = z
	.object({
		aud: z.enum(MicroserviceAudience),
		exp: z.int(),
		iat: z.int(),
		sub: z.uuid(),
	})
	.strict()
	.superRefine((claims, context) => {
		if (claims.exp - claims.iat === MicroserviceAccessTokenConstants.LIFETIME_SECONDS) return;

		context.addIssue({
			code: "custom",
			message: "Microservice access tokens must use the fixed lifetime",
			path: ["exp"],
		});
	});
