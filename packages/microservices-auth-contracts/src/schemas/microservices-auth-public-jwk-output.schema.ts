import { z } from "zod";
import { MicroserviceAccessTokenConstants } from "../microservice-access-token.constants.js";

export const MicroservicesAuthPublicJwkOutputSchema = z
	.object({
		alg: z.literal(MicroserviceAccessTokenConstants.ALGORITHM),
		crv: z.literal(MicroserviceAccessTokenConstants.CURVE),
		kid: z.string().min(1),
		kty: z.literal(MicroserviceAccessTokenConstants.JWK_KEY_TYPE),
		use: z.literal(MicroserviceAccessTokenConstants.JWK_USE),
		x: z.string().base64url().length(43),
		y: z.string().base64url().length(43),
	})
	.strict()
	.readonly();
