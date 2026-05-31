import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";

describe("databaseConfig", () => {
	const TEST_POOLER_URL = "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/db?sslmode=require";

	beforeEach(() => {
		process.env["DATABASE_POOLER_URL"] = TEST_POOLER_URL;
	});

	afterEach(() => {
		delete process.env["DATABASE_POOLER_URL"];
	});

	it("should have the correct config key", () => {
		expect(DATABASE_CONFIG_KEY).toBe("database");
	});

	it("should return poolerUrl from env vars", () => {
		const config = databaseConfig();

		expect(config).toEqual({
			poolerUrl: TEST_POOLER_URL,
			statementTimeoutMs: 5_000,
			queryTimeoutMs: 6_000,
			lockTimeoutMs: 1_000,
			connectionTimeoutMs: 10_000,
		});
	});

	it("should return the latest env values on each call", () => {
		const first = databaseConfig();
		expect(first.poolerUrl).toBe(TEST_POOLER_URL);

		process.env["DATABASE_POOLER_URL"] = "postgresql://other:pass@other.com/db";

		const second = databaseConfig();
		expect(second.poolerUrl).toBe("postgresql://other:pass@other.com/db");
		expect(first.poolerUrl).toBe(TEST_POOLER_URL);
	});
});
