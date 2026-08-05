import { z } from "zod";

export const IEnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "staging", "test"]),
	PORT: z.coerce.number().default(3000),
	DATABASE_APP_POOLER_URL: z.string().url(),
	CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required"),
	PROTOMAP_AUTH_SECRET: z.string().min(1, "PROTOMAP_AUTH_SECRET is required"),
	PROTOMAP_URL: z.string().url("PROTOMAP_URL must be a valid URL"),
	CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
	AI_GATEWAY_API_TOKEN: z.string().min(1, "AI_GATEWAY_API_TOKEN is required"),
	CLOUDFLARE_AI_GATEWAY_ID: z.string().min(1, "CLOUDFLARE_AI_GATEWAY_ID is required"),
	UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
	UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
});

export type IEnv = z.infer<typeof IEnvSchema>;
