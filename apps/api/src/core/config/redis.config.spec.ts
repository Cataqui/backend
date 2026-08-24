import { type IRedisConfig, redisConfig } from "./redis.config";

describe("redisConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should expose the provider-neutral Redis config key", () => {
		expect(redisConfig.KEY).toBe("CONFIGURATION(redis)");
	});

	it("should load plaintext connection credentials", () => {
		process.env["REDIS_URL"] = "redis://redis.example.com:6379";
		process.env["REDIS_USERNAME"] = "runtime";
		process.env["REDIS_PASSWORD"] = "test-password";
		delete process.env["REDIS_CA_CERT_BASE64"];

		const config: IRedisConfig = redisConfig();

		expect(config).toEqual({
			password: "test-password",
			url: "redis://redis.example.com:6379",
			username: "runtime",
		});
	});

	it("should decode the production CA bundle", () => {
		process.env["REDIS_URL"] = "rediss://redis.example.com:6380";
		process.env["REDIS_USERNAME"] = "runtime";
		process.env["REDIS_PASSWORD"] = "test-password";
		process.env["REDIS_CA_CERT_BASE64"] = Buffer.from("certificate").toString("base64");

		expect(redisConfig()).toEqual({
			caCertificate: "certificate",
			password: "test-password",
			url: "rediss://redis.example.com:6380",
			username: "runtime",
		});
	});
});
