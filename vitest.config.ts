import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		env: {
			NODE_ENV: "test",
			AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: Buffer.alloc(32, 1).toString("base64url"),
			WHATSAPP_AUTH_RECEIVER: "+15556625497",
			DATABASE_APP_POOLER_URL: "postgresql://test:test@localhost:5432/test?schema=public",
			CORS_ORIGINS: "http://localhost:3000",
			CLOUDFLARE_ACCOUNT_ID: "test-account-id",
			AI_GATEWAY_API_TOKEN: "test-api-token",
			CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "test-token",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/main.ts", "src/bootstrap.ts", "src/app.module.ts", "src/**/index.ts", "src/**/*.module.ts"],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 90,
				statements: 90,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
});
