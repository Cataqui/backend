import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../vitest.shared";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		env: {
			NODE_ENV: "test",
			AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: Buffer.alloc(32, 1).toString("base64url"),
			MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: generateKeyPairSync("ec", {
				namedCurve: "prime256v1",
				privateKeyEncoding: { format: "der", type: "pkcs8" },
				publicKeyEncoding: { format: "der", type: "spki" },
			}).privateKey.toString("base64"),
			WHATSAPP_NOTP_RECEIVER: "+15556625497",
			DATABASE_APP_POOLER_URL: "postgresql://test:test@localhost:5432/test?schema=public",
			CORS_ORIGINS: "http://localhost:3000",
			CLOUDFLARE_ACCOUNT_ID: "test-account-id",
			AI_GATEWAY_API_TOKEN: "test-api-token",
			DERIVE_JOB_DATA_AI_GATEWAY_ID: "test-gateway-id",
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
