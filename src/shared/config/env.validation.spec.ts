import { IEnvSchema } from "./env.validation";

describe("IEnvSchema", () => {
	describe("valid input", () => {
		it("should parse a valid environment with all fields", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "production",
				PORT: "4000",
				API_PREFIX: "api",
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.NODE_ENV).toBe("production");
				expect(result.data.PORT).toBe(4000);
				expect(result.data.API_PREFIX).toBe("api");
				expect(result.data.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
			}
		});
	});

	describe("defaults", () => {
		it("should default NODE_ENV to 'development'", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.NODE_ENV).toBe("development");
			}
		});

		it("should default PORT to 3000", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.PORT).toBe(3000);
			}
		});

		it("should default API_PREFIX to 'api'", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.API_PREFIX).toBe("api");
			}
		});

		it("should coerce PORT from string to number", () => {
			const result = IEnvSchema.safeParse({
				PORT: "8080",
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.PORT).toBe(8080);
				expect(typeof result.data.PORT).toBe("number");
			}
		});
	});

	describe("validation errors", () => {
		it("should fail when DATABASE_URL is missing", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "development",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when DATABASE_URL is not a valid URL", () => {
			const result = IEnvSchema.safeParse({
				DATABASE_URL: "not-a-url",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when NODE_ENV is not a valid enum value", () => {
			const result = IEnvSchema.safeParse({
				NODE_ENV: "staging",
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});

		it("should fail when PORT is not a valid number", () => {
			const result = IEnvSchema.safeParse({
				PORT: "not-a-number",
				DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
			});

			expect(result.success).toBe(false);
		});
	});
});
