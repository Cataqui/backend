import { z } from "zod";

export const EnvSchema = z.object({
	ENVIRONMENT: z.enum(["development", "production", "staging"]),
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	DATABASE_APP_POOLER_URL: z.url(),
	CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required"),
	CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
	AI_GATEWAY_API_TOKEN: z.string().min(1, "AI_GATEWAY_API_TOKEN is required"),
	DERIVE_JOB_DATA_AI_GATEWAY_ID: z.string().min(1, "DERIVE_JOB_DATA_AI_GATEWAY_ID is required"),
	UPSTASH_REDIS_REST_URL: z.url("UPSTASH_REDIS_REST_URL must be a valid URL"),
	UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
});

export type Env = z.infer<typeof EnvSchema>;
