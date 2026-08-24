import { z } from "zod";

export const EnvSchema = z
	.object({
		NODE_ENV: z.enum(["development", "production", "staging", "test"]),
		PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
		DATABASE_APP_POOLER_URL: z.string().url(),
		CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required"),
		CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
		DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN: z.string().min(1, "DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN is required"),
		DERIVE_JOB_DATA_AI_GATEWAY_ID: z.string().min(1, "DERIVE_JOB_DATA_AI_GATEWAY_ID is required"),
		REDIS_URL: z.url().refine((value) => ["redis:", "rediss:"].includes(new URL(value).protocol), {
			message: "REDIS_URL must use redis:// or rediss://",
		}),
		REDIS_USERNAME: z.string().min(1, "REDIS_USERNAME is required"),
		REDIS_PASSWORD: z.string().min(1, "REDIS_PASSWORD is required"),
		REDIS_CA_CERT_BASE64: z.base64("REDIS_CA_CERT_BASE64 must be a base64-encoded PEM bundle").optional(),
		AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: z
			.string()
			.regex(/^[A-Za-z0-9_-]{43}$/, "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL must be a 32-byte base64url value")
			.refine(
				(value) => Buffer.from(value, "base64url").length === 32,
				"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL must decode to exactly 32 bytes",
			),
		MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: z.base64(
			"MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64 must be base64-encoded PKCS#8 key material",
		),
		WHATSAPP_AUTH_RECEIVER: z
			.string()
			.regex(/^\+[1-9]\d{1,14}$/, "WHATSAPP_AUTH_RECEIVER must use E.164 format, such as +5511999999999"),
	})
	.superRefine((environment, context) => {
		if (environment.REDIS_CA_CERT_BASE64 !== undefined) return;

		if (environment.NODE_ENV === "production") {
			context.addIssue({
				code: "custom",
				message: "REDIS_CA_CERT_BASE64 is required in production",
				path: ["REDIS_CA_CERT_BASE64"],
			});
			return;
		}

		if (!environment.REDIS_URL.startsWith("rediss://")) return;

		context.addIssue({
			code: "custom",
			message: "REDIS_CA_CERT_BASE64 is required for rediss:// connections",
			path: ["REDIS_CA_CERT_BASE64"],
		});
	});

export type Env = z.infer<typeof EnvSchema>;
