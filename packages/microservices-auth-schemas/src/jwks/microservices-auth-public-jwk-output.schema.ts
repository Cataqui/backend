import { z } from "zod";
import { MicroservicesAuthJwksConstants } from "./microservices-auth-jwks.constants.js";

export const MicroservicesAuthPublicJwkOutputSchema = z
	.strictObject({
		alg: z.literal(MicroservicesAuthJwksConstants.ALGORITHM),
		crv: z.literal(MicroservicesAuthJwksConstants.CURVE),
		kid: z.string().min(1),
		kty: z.literal(MicroservicesAuthJwksConstants.KEY_TYPE),
		use: z.literal(MicroservicesAuthJwksConstants.USE),
		x: z.base64url().length(43),
		y: z.base64url().length(43),
	})
	.readonly();
