import { z } from "zod";
import { GeoimageAccessTokenConstants } from "./geoimage-access-token.constants.js";

export const GeoimageAccessTokenPayloadSchema = z.strictObject({
	aud: z.literal(GeoimageAccessTokenConstants.AUDIENCE),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});
