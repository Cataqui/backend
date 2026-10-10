import { z } from "zod";

export const EnvSchema = z.object({
	ENVIRONMENT: z.enum(["development", "staging", "production"]),
	MICROSERVICES_AUTH_JWKS_URL: z.url(),
	STATIC_BASE_URL: z.url(),
	GOOGLE_PLACES_API_KEY: z.string().min(1),
	GEOAPIFY_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;
