import { type IUpstashRedisConfig, upstashRedisConfig } from "./upstash-redis.config";

describe("upstashRedisConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should expose the Upstash Redis config key", () => {
		expect(upstashRedisConfig.KEY).toBe("CONFIGURATION(upstashRedis)");
	});

	it("should load the REST URL and token from the environment", () => {
		process.env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
		process.env["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

		const config: IUpstashRedisConfig = upstashRedisConfig();

		expect(config).toEqual({ restUrl: "https://example.upstash.io", restToken: "test-token" });
	});
});
