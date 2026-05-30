import { THROTTLE_CONFIG_KEY, throttleConfig } from "./throttle.config";

describe("throttleConfig", () => {
	it("should have the correct config key", () => {
		expect(THROTTLE_CONFIG_KEY).toBe("throttle");
	});

	it("should return ttl and limit matching defaults", () => {
		const config = throttleConfig();

		expect(config).toEqual({
			ttl: 300_000,
			limit: 1_000,
		});
	});
});
