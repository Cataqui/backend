import { z } from "zod";
import { EnvSchema } from "../../../shared/config/env.schema";

export const StaticConfigSchema = z.strictObject({
	geoapifyApiKey: EnvSchema.shape.GEOAPIFY_API_KEY,
	environment: EnvSchema.shape.ENVIRONMENT,
	baseUrl: EnvSchema.shape.STATIC_BASE_URL,
});

export type StaticConfig = z.infer<typeof StaticConfigSchema>;
