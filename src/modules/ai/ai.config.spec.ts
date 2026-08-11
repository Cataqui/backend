import { aiConfig, type IAiConfig } from "./ai.config";

describe("aiConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should return the correct config key", () => {
		expect(aiConfig.KEY).toBe("CONFIGURATION(ai)");
	});

	it("should load cloudflareAccountId from CLOUDFLARE_ACCOUNT_ID", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "test-account";
		process.env["AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["CLOUDFLARE_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.cloudflareAccountId).toBe("test-account");
	});

	it("should load aiApiToken from AI_GATEWAY_API_TOKEN", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "test-account";
		process.env["AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["CLOUDFLARE_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.aiApiToken).toBe("test-token");
	});

	it("should load cloudflareAiGatewayId from CLOUDFLARE_AI_GATEWAY_ID", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "test-account";
		process.env["AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["CLOUDFLARE_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.cloudflareAiGatewayId).toBe("test-gateway");
	});

	it("should load all three config values", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "account-123";
		process.env["AI_GATEWAY_API_TOKEN"] = "token-456";
		process.env["CLOUDFLARE_AI_GATEWAY_ID"] = "gateway-789";

		const config: IAiConfig = aiConfig();

		expect(config).toEqual({
			cloudflareAccountId: "account-123",
			aiApiToken: "token-456",
			cloudflareAiGatewayId: "gateway-789",
		});
	});
});
