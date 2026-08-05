import { ContainerEnv } from "./container-env";

describe("ContainerEnv", () => {
	it("should forward every API process environment value", () => {
		const env = {
			NODE_ENV: "development",
			DATABASE_APP_POOLER_URL: "postgresql://pooler",
			CORS_ORIGINS: "https://cataqui.com",
			PROTOMAP_AUTH_SECRET: "map-secret",
			PROTOMAP_URL: "https://maps.cataqui.com",
			CLOUDFLARE_ACCOUNT_ID: "account-id",
			AI_GATEWAY_API_TOKEN: "gateway-token",
			CLOUDFLARE_AI_GATEWAY_ID: "gateway-id",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "redis-token",
		} as Env;

		const result = ContainerEnv.fromWorkerEnv({ env: env });

		expect(result).toEqual({
			NODE_ENV: "development",
			DATABASE_APP_POOLER_URL: "postgresql://pooler",
			CORS_ORIGINS: "https://cataqui.com",
			PROTOMAP_AUTH_SECRET: "map-secret",
			PROTOMAP_URL: "https://maps.cataqui.com",
			CLOUDFLARE_ACCOUNT_ID: "account-id",
			AI_GATEWAY_API_TOKEN: "gateway-token",
			CLOUDFLARE_AI_GATEWAY_ID: "gateway-id",
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "redis-token",
		});
	});
});
