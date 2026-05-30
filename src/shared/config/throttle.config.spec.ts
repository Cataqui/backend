import { GLOBAL_THROTTLE_CONFIG_KEY, globalThrottleConfig } from "./throttle.config";

describe("globalThrottleConfig", () => {
	it("should have the correct config key", () => {
		expect(GLOBAL_THROTTLE_CONFIG_KEY).toBe("throttle");
	});

	it("should return ttl and limit matching defaults", () => {
		const config = globalThrottleConfig();

		expect(config).toEqual({
			ttl: 300_000,
			limit: 1_000,
		});
	});
});
