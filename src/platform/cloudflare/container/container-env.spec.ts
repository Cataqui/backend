import { ContainerEnv } from "./container-env";

describe("ContainerEnv", () => {
	it("should forward every API process environment value", () => {
		const env = {
			NODE_ENV: "development",
			DATABASE_POOLER_URL: "postgresql://pooler",
			DATABASE_DIRECT_URL: "postgresql://direct",
			CORS_ORIGINS: "https://cataqui.com",
			PROTOMAP_AUTH_SECRET: "map-secret",
			PROTOMAP_URL: "https://maps.cataqui.com",
			CLOUDFLARE_ACCOUNT_ID: "account-id",
			AI_GATEWAY_API_TOKEN: "gateway-token",
			CLOUDFLARE_AI_GATEWAY_ID: "gateway-id",
		} as Env;

		const result = ContainerEnv.fromWorkerEnv({ env: env });

		expect(result).toEqual({
			NODE_ENV: "development",
			DATABASE_POOLER_URL: "postgresql://pooler",
			DATABASE_DIRECT_URL: "postgresql://direct",
			CORS_ORIGINS: "https://cataqui.com",
			PROTOMAP_AUTH_SECRET: "map-secret",
			PROTOMAP_URL: "https://maps.cataqui.com",
			CLOUDFLARE_ACCOUNT_ID: "account-id",
			AI_GATEWAY_API_TOKEN: "gateway-token",
			CLOUDFLARE_AI_GATEWAY_ID: "gateway-id",
		});
	});
});
