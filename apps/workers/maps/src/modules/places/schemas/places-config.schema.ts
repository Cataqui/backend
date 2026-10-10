import { z } from "zod";
import { EnvSchema } from "../../../shared/config/env.schema";

export const PlacesConfigSchema = z.strictObject({
	googlePlacesApiKey: EnvSchema.shape.GOOGLE_PLACES_API_KEY,
	geoapifyApiKey: EnvSchema.shape.GEOAPIFY_API_KEY,
});

export type PlacesConfig = z.infer<typeof PlacesConfigSchema>;
