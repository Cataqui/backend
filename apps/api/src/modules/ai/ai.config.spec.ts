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
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.cloudflareAccountId).toBe("test-account");
	});

	it("should load deriveJobDataAiGatewayApiToken from DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "test-account";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.deriveJobDataAiGatewayApiToken).toBe("test-token");
	});

	it("should load deriveJobDataAiGatewayId from DERIVE_JOB_DATA_AI_GATEWAY_ID", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "test-account";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"] = "test-token";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"] = "test-gateway";

		const config: IAiConfig = aiConfig();

		expect(config.deriveJobDataAiGatewayId).toBe("test-gateway");
	});

	it("should load all three config values", () => {
		process.env["CLOUDFLARE_ACCOUNT_ID"] = "account-123";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"] = "token-456";
		process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"] = "gateway-789";

		const config: IAiConfig = aiConfig();

		expect(config).toEqual({
			cloudflareAccountId: "account-123",
			deriveJobDataAiGatewayApiToken: "token-456",
			deriveJobDataAiGatewayId: "gateway-789",
		});
	});
});
