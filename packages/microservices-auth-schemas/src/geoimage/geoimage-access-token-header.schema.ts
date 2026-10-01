import { z } from "zod";
import { GeoimageAccessTokenConstants } from "./geoimage-access-token.constants.js";

export const GeoimageAccessTokenHeaderSchema = z.strictObject({
	alg: z.literal(GeoimageAccessTokenConstants.ALGORITHM),
	kid: z.string().min(1),
	typ: z.literal(GeoimageAccessTokenConstants.TOKEN_TYPE),
});
