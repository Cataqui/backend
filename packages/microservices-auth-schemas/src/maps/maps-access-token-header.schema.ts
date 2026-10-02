import { z } from "zod";
import { MapsAccessTokenConstants } from "./maps-access-token.constants.js";

export const MapsAccessTokenHeaderSchema = z.strictObject({
	alg: z.literal(MapsAccessTokenConstants.ALGORITHM),
	kid: z.string().min(1),
	typ: z.literal(MapsAccessTokenConstants.TOKEN_TYPE),
});
