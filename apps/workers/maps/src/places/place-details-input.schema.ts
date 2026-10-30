import { z } from "zod";
import { PlaceSessionTokenSchema } from "./place-session-token.schema";

export const PlaceDetailsInputSchema = z.strictObject({
	placeId: z.string().trim().min(1).max(256),
	sessionToken: PlaceSessionTokenSchema,
});

export type PlaceDetailsInput = z.infer<typeof PlaceDetailsInputSchema>;
