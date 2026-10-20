import { z } from "zod";
import { PlaceSessionTokenSchema } from "./place-session-token.schema";

export const PlaceSearchInputSchema = z
	.strictObject({
		query: z.string().max(256).trim(),
		sessionToken: PlaceSessionTokenSchema,
	})
	.meta({ examples: [{ query: "Osasco", sessionToken: "session-123" }] });

export type PlaceSearchInput = z.infer<typeof PlaceSearchInputSchema>;
