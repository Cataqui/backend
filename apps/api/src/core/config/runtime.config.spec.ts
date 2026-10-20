import { runtimeConfig } from "./runtime.config";

describe("runtimeConfig", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it.each(["development", "staging", "production"])("loads the %s runtime environment", (environment) => {
		vi.stubEnv("ENVIRONMENT", environment);
		expect(runtimeConfig()).toEqual({ environment: environment });
	});

	it("keeps staging deployment independent of Node production mode", () => {
		vi.stubEnv("ENVIRONMENT", "staging");
		vi.stubEnv("NODE_ENV", "production");
		expect(runtimeConfig()).toEqual({ environment: "staging" });
	});

	it.each([undefined, "invalid", "test"])("rejects an unsupported runtime environment %s", (environment) => {
		vi.stubEnv("ENVIRONMENT", environment);
		expect(() => runtimeConfig()).toThrow();
	});
});
