import { z } from "zod";

export const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "staging", "test"]),
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	DATABASE_APP_POOLER_URL: z.string().url(),
	CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required"),
	CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
	AI_GATEWAY_API_TOKEN: z.string().min(1, "AI_GATEWAY_API_TOKEN is required"),
	CLOUDFLARE_AI_GATEWAY_ID: z.string().min(1, "CLOUDFLARE_AI_GATEWAY_ID is required"),
	UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
	UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
	AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: z
		.string()
		.regex(/^[A-Za-z0-9_-]{43}$/, "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL must be a 32-byte base64url value")
		.refine(
			(value) => Buffer.from(value, "base64url").length === 32,
			"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL must decode to exactly 32 bytes",
		),
	WHATSAPP_AUTH_RECEIVER: z
		.string()
		.regex(/^\+[1-9]\d{1,14}$/, "WHATSAPP_AUTH_RECEIVER must use E.164 format, such as +5511999999999"),
});

export type Env = z.infer<typeof EnvSchema>;
