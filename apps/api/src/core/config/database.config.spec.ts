import { databaseConfig } from "./database.config";

describe("databaseConfig", () => {
	const TEST_POOLER_URL = "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/db?sslmode=require";

	afterEach(() => {
		delete process.env["DATABASE_APP_POOLER_URL"];
	});

	it("should have the correct config key", () => {
		expect(databaseConfig.KEY).toBe("CONFIGURATION(database)");
	});

	it("should return appPoolerUrl from env vars", () => {
		process.env["DATABASE_APP_POOLER_URL"] = TEST_POOLER_URL;
		const config = databaseConfig();

		expect(config).toEqual({
			appPoolerUrl: TEST_POOLER_URL,
			minimumPoolConnections: 1,
			statementTimeoutMs: 5_000,
			queryTimeoutMs: 6_000,
			lockTimeoutMs: 1_000,
			connectionTimeoutMs: 10_000,
		});
	});

	it("should read the initial database URL", () => {
		process.env["DATABASE_APP_POOLER_URL"] = TEST_POOLER_URL;
		const first = databaseConfig();
		expect(first.appPoolerUrl).toBe(TEST_POOLER_URL);

		process.env["DATABASE_APP_POOLER_URL"] = "postgresql://other:pass@other.com/db";

		databaseConfig();
	});

	it("should read a changed database URL on the next call", () => {
		process.env["DATABASE_APP_POOLER_URL"] = TEST_POOLER_URL;
		databaseConfig();

		process.env["DATABASE_APP_POOLER_URL"] = "postgresql://other:pass@other.com/db";

		const second = databaseConfig();
		expect(second.appPoolerUrl).toBe("postgresql://other:pass@other.com/db");
	});

	it("should retain the previous database config after the environment changes", () => {
		process.env["DATABASE_APP_POOLER_URL"] = TEST_POOLER_URL;
		const first = databaseConfig();

		process.env["DATABASE_APP_POOLER_URL"] = "postgresql://other:pass@other.com/db";

		databaseConfig();

		expect(first.appPoolerUrl).toBe(TEST_POOLER_URL);
	});
});
