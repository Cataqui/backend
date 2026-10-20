import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

describe("ConfigModule", () => {
	let originalWorkingDirectory: string;
	let environmentDirectory: string;

	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv("HOST", undefined);
		vi.stubEnv("PORT", undefined);
		originalWorkingDirectory = process.cwd();
		environmentDirectory = mkdtempSync(path.join(tmpdir(), "cataqui-api-config-"));
		const applicationDirectory = path.join(environmentDirectory, "apps", "api");
		mkdirSync(applicationDirectory, { recursive: true });
		process.chdir(applicationDirectory);
	});

	afterEach(() => {
		process.chdir(originalWorkingDirectory);
		rmSync(environmentDirectory, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	it("should preserve HOST loaded only from .env when the environment schema does not declare it", async () => {
		writeFileSync(path.join(process.cwd(), ".env"), "HOST=127.0.0.1\nPORT=8081\n");
		const { ConfigModule } = await import("./config.module");
		const module = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
		const config = module.get(ConfigService);
		const loadedValues = {
			host: config.get<string>("HOST"),
			listenHost: process.env["HOST"],
			port: config.get<number>("PORT"),
		};

		await module.close();

		expect(loadedValues).toEqual({ host: "127.0.0.1", listenHost: "127.0.0.1", port: 8081 });
	});

	it("provides the API runtime environment loaded from its own .env", async () => {
		vi.stubEnv("ENVIRONMENT", undefined);
		writeFileSync(path.join(process.cwd(), ".env"), "ENVIRONMENT=staging\n");
		const { ConfigModule } = await import("./config.module");
		const { runtimeConfig } = await import("./runtime.config");
		const module = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
		expect(module.get(runtimeConfig.KEY)).toEqual({ environment: "staging" });
		await module.close();
	});

	it("loads the API database from its own file without loading repository-root secrets", async () => {
		vi.stubEnv("DATABASE_APP_POOLER_URL", undefined);
		vi.stubEnv("META_APP_SECRET", undefined);
		writeFileSync(
			path.join(environmentDirectory, ".env"),
			"DATABASE_APP_POOLER_URL=postgresql://root:root@localhost:5432/wrong\nMETA_APP_SECRET=root-secret\n",
		);
		writeFileSync(
			path.join(process.cwd(), ".env"),
			"DATABASE_APP_POOLER_URL=postgresql://api:api@localhost:5432/cataqui\n",
		);
		const { ConfigModule } = await import("./config.module");
		const module = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
		const loadedValues = {
			database: module.get(ConfigService).get<string>("DATABASE_APP_POOLER_URL"),
			metaSecret: process.env["META_APP_SECRET"],
		};
		await module.close();

		expect(loadedValues).toEqual({
			database: "postgresql://api:api@localhost:5432/cataqui",
			metaSecret: undefined,
		});
	});

	it("preserves injected runtime values over the API local file", async () => {
		vi.stubEnv("DATABASE_APP_POOLER_URL", "postgresql://runtime:runtime@localhost:5432/runtime");
		writeFileSync(
			path.join(process.cwd(), ".env"),
			"DATABASE_APP_POOLER_URL=postgresql://local:local@localhost:5432/local\n",
		);
		const { ConfigModule } = await import("./config.module");
		const module = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
		const database = module.get(ConfigService).get<string>("DATABASE_APP_POOLER_URL");
		await module.close();

		expect(database).toBe("postgresql://runtime:runtime@localhost:5432/runtime");
	});

	it("should share one runtime configuration between injection and namespaced lookup", async () => {
		writeFileSync(path.join(process.cwd(), ".env"), "");
		const { ConfigModule } = await import("./config.module");
		const { runtimeConfig } = await import("./runtime.config");
		const module = await Test.createTestingModule({
			imports: [ConfigModule],
			providers: [
				{
					provide: "runtimeConsumer",
					useFactory: (runtime: ReturnType<typeof runtimeConfig>) => runtime,
					inject: [runtimeConfig.KEY],
				},
			],
		}).compile();
		const runtime = module.get("runtimeConsumer");
		const namespacedRuntime = module.get(ConfigService).get("runtime");
		await module.close();

		expect(runtime).toBe(namespacedRuntime);
	});

	it("should default PORT when neither .env nor the process environment defines it", async () => {
		writeFileSync(path.join(process.cwd(), ".env"), "");
		const { ConfigModule } = await import("./config.module");
		const module = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
		const loadedValues = {
			port: module.get(ConfigService).get<number>("PORT"),
			listenPort: process.env["PORT"],
		};

		await module.close();

		expect(loadedValues).toEqual({ port: 3000, listenPort: "3000" });
	});

	it("should reject invalid environment fields with paths while excluding submitted secret values", async () => {
		writeFileSync(path.join(process.cwd(), ".env"), "");
		vi.stubEnv("DATABASE_APP_POOLER_URL", "invalid-database-url-secret");
		vi.stubEnv("UPSTASH_REDIS_REST_URL", "invalid-redis-url-secret");
		const { ConfigModule } = await import("./config.module");
		const failure: unknown = await Test.createTestingModule({ imports: [ConfigModule] })
			.compile()
			.catch((error: unknown) => error);

		if (!(failure instanceof Error)) throw new Error("Invalid environment unexpectedly passed validation");

		expect({
			databasePath: failure.message.includes("DATABASE_APP_POOLER_URL: Invalid URL"),
			redisPath: failure.message.includes("UPSTASH_REDIS_REST_URL: UPSTASH_REDIS_REST_URL must be a valid URL"),
			databaseValue: failure.message.includes("invalid-database-url-secret"),
			redisValue: failure.message.includes("invalid-redis-url-secret"),
		}).toEqual({
			databasePath: true,
			redisPath: true,
			databaseValue: false,
			redisValue: false,
		});
	});
});
