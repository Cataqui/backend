import path from "node:path";
import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../vitest.shared.ts";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		env: {
			NODE_ENV: "test",
			ENVIRONMENT: "development",
			DATABASE_APP_POOLER_URL: "postgresql://test:test@localhost:5432/test?schema=public",
			CORS_ORIGINS: "http://localhost:3000",
			CLOUDFLARE_ACCOUNT_ID: "test-account-id",
			AI_GATEWAY_API_TOKEN: "test-api-token",
			AI_GATEWAY_ID: "test-gateway-id",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "test-token",
		},
		coverage: {
			...WorkspaceCoverage,
			include: ["src/**/*.ts"],
			exclude: ["src/main.ts", "src/bootstrap.ts", "src/app.module.ts", "src/**/index.ts", "src/**/*.module.ts"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
		},
	},
});
