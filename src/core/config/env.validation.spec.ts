import { EnvSchema } from "./env.validation";

const validEnvironmentSecrets = {
	AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: Buffer.alloc(32, 1).toString("base64url"),
} as const;

function _createValidEnvironment(): Record<string, string> {
	return {
		...validEnvironmentSecrets,
		NODE_ENV: "development",
		PORT: "3000",
		DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
		CORS_ORIGINS: "http://localhost:3000",
		CLOUDFLARE_ACCOUNT_ID: "test-account-id",
		AI_GATEWAY_API_TOKEN: "test-api-token",
		CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
		UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
		UPSTASH_REDIS_REST_TOKEN: "test-token",
	};
}

describe("EnvSchema", () => {
	describe("valid input", () => {
		it("should parse a valid environment with all fields", () => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "production",
				PORT: "4000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(
				result.success
					? {
							nodeEnvironment: result.data.NODE_ENV,
							port: result.data.PORT,
							databaseUrl: result.data.DATABASE_APP_POOLER_URL,
						}
					: result,
			).toEqual({
				nodeEnvironment: "production",
				port: 4000,
				databaseUrl: "postgresql://user:pass@localhost:5432/db",
			});
		});
	});

	describe("defaults", () => {
		it("should require NODE_ENV", () => {
			const environment = _createValidEnvironment();
			delete environment["NODE_ENV"];
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should default PORT to 3000", () => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "development",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success ? result.data.PORT : result).toBe(3000);
		});

		it("should coerce PORT from string to number", () => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "development",
				PORT: "8080",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success ? { port: result.data.PORT, type: typeof result.data.PORT } : result).toEqual({
				port: 8080,
				type: "number",
			});
		});
	});

	describe("validation errors", () => {
		it("should fail when AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL is missing", () => {
			const environment = _createValidEnvironment();
			delete environment["AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"];

			expect(EnvSchema.safeParse(environment).success).toBe(false);
		});

		it("should fail when AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL is not base64url", () => {
			const environment = _createValidEnvironment();
			environment["AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"] = "not-base64url!";

			expect(EnvSchema.safeParse(environment).success).toBe(false);
		});

		it("should fail when AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL does not decode to 32 bytes", () => {
			const environment = _createValidEnvironment();
			environment["AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"] = Buffer.alloc(31, 1).toString("base64url");

			expect(EnvSchema.safeParse(environment).success).toBe(false);
		});

		it("should fail when UPSTASH_REDIS_REST_URL is missing", () => {
			const environment = _createValidEnvironment();
			delete environment["UPSTASH_REDIS_REST_URL"];
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when UPSTASH_REDIS_REST_URL is not a valid URL", () => {
			const environment = _createValidEnvironment();
			environment["UPSTASH_REDIS_REST_URL"] = "not-a-url";
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when UPSTASH_REDIS_REST_TOKEN is missing", () => {
			const environment = _createValidEnvironment();
			delete environment["UPSTASH_REDIS_REST_TOKEN"];
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when DATABASE_APP_POOLER_URL is missing", () => {
			const environment = _createValidEnvironment();
			delete environment["DATABASE_APP_POOLER_URL"];
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when DATABASE_APP_POOLER_URL is not a valid URL", () => {
			const environment = _createValidEnvironment();
			environment["DATABASE_APP_POOLER_URL"] = "not-a-url";
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should accept staging environment", () => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "staging",
				CORS_ORIGINS: "http://localhost:3000",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(true);
		});

		it("should fail when NODE_ENV is not a valid enum value", () => {
			const environment = _createValidEnvironment();
			environment["NODE_ENV"] = "invalid";
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when PORT is not a valid number", () => {
			const environment = _createValidEnvironment();
			environment["PORT"] = "not-a-number";
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it.each(["0", "1.5", "65536"])("should reject PORT value %s outside the valid TCP port range", (port) => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "development",
				PORT: port,
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CORS_ORIGINS: "http://localhost:3000",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("CORS_ORIGINS", () => {
		it("should accept a valid CORS_ORIGINS string", () => {
			const result = EnvSchema.safeParse({
				...validEnvironmentSecrets,
				NODE_ENV: "development",
				CORS_ORIGINS: "https://cataqui.com,https://app.cataqui.com",
				DATABASE_APP_POOLER_URL: "postgresql://user:pass@localhost:5432/db",
				CLOUDFLARE_ACCOUNT_ID: "test-account-id",
				AI_GATEWAY_API_TOKEN: "test-api-token",
				CLOUDFLARE_AI_GATEWAY_ID: "test-gateway-id",
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			});

			expect(result.success ? result.data.CORS_ORIGINS : result).toBe("https://cataqui.com,https://app.cataqui.com");
		});

		it("should fail when CORS_ORIGINS is missing", () => {
			const environment = _createValidEnvironment();
			delete environment["CORS_ORIGINS"];
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});

		it("should fail when CORS_ORIGINS is empty", () => {
			const environment = _createValidEnvironment();
			environment["CORS_ORIGINS"] = "";
			const result = EnvSchema.safeParse(environment);

			expect(result.success).toBe(false);
		});
	});
});
