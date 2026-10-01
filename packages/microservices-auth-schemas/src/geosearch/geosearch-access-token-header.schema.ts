import { z } from "zod";
import { GeosearchAccessTokenConstants } from "./geosearch-access-token.constants.js";

export const GeosearchAccessTokenHeaderSchema = z.strictObject({
	alg: z.literal(GeosearchAccessTokenConstants.ALGORITHM),
	kid: z.string().min(1),
	typ: z.literal(GeosearchAccessTokenConstants.TOKEN_TYPE),
});
