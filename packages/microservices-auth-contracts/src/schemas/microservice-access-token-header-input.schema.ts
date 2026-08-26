import { z } from "zod";
import { MicroserviceAccessTokenConstants } from "../microservice-access-token.constants.js";

export const MicroserviceAccessTokenHeaderInputSchema = z
	.object({
		alg: z.literal(MicroserviceAccessTokenConstants.ALGORITHM),
		kid: z.string().min(1),
		typ: z.literal(MicroserviceAccessTokenConstants.TOKEN_TYPE),
	})
	.strict();
