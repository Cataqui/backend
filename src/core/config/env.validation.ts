import { z } from "zod";

export const IEnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "staging", "test"]),
	PORT: z.coerce.number().default(3000),
	DATABASE_POOLER_URL: z.string().url(),
	DATABASE_DIRECT_URL: z.string().url(),
	CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required"),
	PROTOMAP_AUTH_SECRET: z.string().min(1).default("dev-default-secret"),
	PROTOMAP_URL: z.string().url().default("https://tiles.cataqui.com"),
});

export type IEnv = z.infer<typeof IEnvSchema>;
