import { IEnvSchema } from "./env.validation";

describe("IEnvSchema", () => {
	describe("valid input", () => {
		it("should parse a valid environment with all fields", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "production",
				PORT: "4000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.NODE_ENV).toBe("production");
				expect(result.data.PORT).toBe(4000);
				expect(result.data.DATABASE_APP_POOLER_URL).toBe("postgresql://user:pass@localhost:5432/db");
			}
		});
	});

	describe("defaults", () => {
		it("should require NODE_ENV", () => {
			const result = IEnvSchema.safeParse({
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});

		it("should default PORT to 3000", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.PORT).toBe(3000);
			}
		});

		it("should coerce PORT from string to number", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				PORT: "8080",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.PORT).toBe(8080);
				expect(typeof result.data.PORT).toBe("number");
			}
		});
	});

	describe("validation errors", () => {
		it("should fail when UPSTASH_REDIS_REST_URL is missing", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when UPSTASH_REDIS_REST_URL is not a valid URL", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "not-a-url",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when UPSTASH_REDIS_REST_TOKEN is missing", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when DATABASE_APP_POOLER_URL is missing", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when DATABASE_APP_POOLER_URL is not a valid URL", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_APP_POOLER_URL: "not-a-url",
			});

			expect(result.success).toBe(false);
		});

		it("should accept staging environment", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "staging",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
		});

		it("should fail when NODE_ENV is not a valid enum value", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "invalid",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when PORT is not a valid number", () => {
			const result = IEnvSchema.safeParse({
				PORT: "not-a-number",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("CORS_ORIGINS", () => {
		it("should accept a valid CORS_ORIGINS string", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
				CORS_ORIGINS: "https://cataqui.com,https://app.cataqui.com",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				PROTOMAP_AUTH_SECRET: "test-secret",
				PROTOMAP_URL: "https://tiles.cataqui.com",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.CORS_ORIGINS).toBe("https://cataqui.com,https://app.cataqui.com");
			}
		});

		it("should fail when CORS_ORIGINS is missing", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when CORS_ORIGINS is empty", () => {
			const result = IEnvSchema.safeParse({
				CORS_ORIGINS: "",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});
	});
});
