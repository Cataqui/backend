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
		writeFileSync(path.join(environmentDirectory, ".env"), "HOST=127.0.0.1\nPORT=8081\n");
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

	it("should default PORT when neither .env nor the process environment defines it", async () => {
		writeFileSync(path.join(environmentDirectory, ".env"), "");
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
		writeFileSync(path.join(environmentDirectory, ".env"), "");
		vi.stubEnv("DATABASE_APP_POOLER_URL", "invalid-database-url-secret");
		vi.stubEnv("UPSTASH_REDIS_REST_URL", "invalid-redis-url-secret");
		vi.stubEnv("AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL", "invalid-hmac-secret");
		vi.stubEnv("MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64", "invalid-private-key-secret!");
		const { ConfigModule } = await import("./config.module");
		const failure: unknown = await Test.createTestingModule({ imports: [ConfigModule] })
			.compile()
			.catch((error: unknown) => error);

		if (!(failure instanceof Error)) throw new Error("Invalid environment unexpectedly passed validation");

		expect({
			databasePath: failure.message.includes("DATABASE_APP_POOLER_URL: Invalid URL"),
			redisPath: failure.message.includes("UPSTASH_REDIS_REST_URL: UPSTASH_REDIS_REST_URL must be a valid URL"),
			hmacPath: failure.message.includes("AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL:"),
			privateKeyPath: failure.message.includes("MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64:"),
			databaseValue: failure.message.includes("invalid-database-url-secret"),
			redisValue: failure.message.includes("invalid-redis-url-secret"),
			hmacValue: failure.message.includes("invalid-hmac-secret"),
			privateKeyValue: failure.message.includes("invalid-private-key-secret!"),
		}).toEqual({
			databasePath: true,
			redisPath: true,
			hmacPath: true,
			privateKeyPath: true,
			databaseValue: false,
			redisValue: false,
			hmacValue: false,
			privateKeyValue: false,
		});
	});
});
