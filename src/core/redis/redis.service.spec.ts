import { Test } from "@nestjs/testing";
import { UPSTASH_REDIS_CONFIG_KEY, type IUpstashRedisConfig } from "../config/upstash-redis.config";
import { RedisService } from "./redis.service";

let redisConfigs: Record<string, unknown>[] = [];

const MockRedis = vi.hoisted(() => {
	return class {
		readonly eval = vi.fn();

		constructor(config: Record<string, unknown>) {
			redisConfigs.push(config);
		}
	};
});

vi.mock("@upstash/redis", () => ({
	Redis: MockRedis,
}));

const MOCK_CONFIG: IUpstashRedisConfig = {
	restUrl: "https://example.upstash.io",
	restToken: "test-token",
};

describe("RedisService", () => {
	let redisService: RedisService;

	beforeEach(async () => {
		redisConfigs = [];
		vi.clearAllMocks();

		const module = await Test.createTestingModule({
			providers: [
				{
					provide: UPSTASH_REDIS_CONFIG_KEY,
					useValue: MOCK_CONFIG,
				},
				RedisService,
			],
		}).compile();

		redisService = module.get(RedisService);
	});

	it("should be available for dependency injection", () => {
		expect(redisService).toBeDefined();
	});

	it("should configure the Upstash client with the registered REST URL and token", () => {
		expect(redisConfigs[0]).toEqual({
			url: MOCK_CONFIG.restUrl,
			token: MOCK_CONFIG.restToken,
		});
	});

	it("should atomically create a hash and string when neither key exists", async () => {
		vi.spyOn(redisService, "eval").mockResolvedValue(1);

		await redisService.createHashAndStringIfNeitherExists({
			hashKey: "auth:intent:123",
			hashFields: {
				code_hash: "hash",
				created_at: "2026-08-05T15:00:00.000Z",
			},
			stringKey: "auth:code:hash",
			stringValue: "123",
			expirationSeconds: 900,
		});

		expect(redisService.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("HSET", KEYS[1], ARGV[index], ARGV[index + 1])'),
			["auth:intent:123", "auth:code:hash"],
			["900", "123", "code_hash", "hash", "created_at", "2026-08-05T15:00:00.000Z"],
		);
	});

	it("should report that both records were created when Redis returns one", async () => {
		vi.spyOn(redisService, "eval").mockResolvedValue(1);

		const result = await redisService.createHashAndStringIfNeitherExists({
			hashKey: "auth:intent:123",
			hashFields: { code_hash: "hash" },
			stringKey: "auth:code:hash",
			stringValue: "123",
			expirationSeconds: 900,
		});

		expect(result).toBe(true);
	});

	it("should report a collision without creating either record when Redis returns zero", async () => {
		vi.spyOn(redisService, "eval").mockResolvedValue(0);

		const result = await redisService.createHashAndStringIfNeitherExists({
			hashKey: "auth:intent:123",
			hashFields: { code_hash: "hash" },
			stringKey: "auth:code:hash",
			stringValue: "123",
			expirationSeconds: 900,
		});

		expect(result).toBe(false);
	});

	it.each([
		{
			description: "a blank hash key",
			params: {
				hashKey: " ",
				hashFields: { code_hash: "hash" },
				stringKey: "auth:code:hash",
				stringValue: "123",
				expirationSeconds: 900,
			},
			errorMessage: "hashKey must be a non-empty Redis key",
		},
		{
			description: "a blank string key",
			params: {
				hashKey: "auth:intent:123",
				hashFields: { code_hash: "hash" },
				stringKey: " ",
				stringValue: "123",
				expirationSeconds: 900,
			},
			errorMessage: "stringKey must be a non-empty Redis key",
		},
		{
			description: "the same key for both Redis records",
			params: {
				hashKey: "auth:key",
				hashFields: { code_hash: "hash" },
				stringKey: "auth:key",
				stringValue: "123",
				expirationSeconds: 900,
			},
			errorMessage: "hashKey and stringKey must identify different Redis records",
		},
		{
			description: "an empty hash",
			params: {
				hashKey: "auth:intent:123",
				hashFields: {},
				stringKey: "auth:code:hash",
				stringValue: "123",
				expirationSeconds: 900,
			},
			errorMessage: "hashFields must contain at least one Redis hash field",
		},
		{
			description: "a blank hash field name",
			params: {
				hashKey: "auth:intent:123",
				hashFields: { " ": "hash" },
				stringKey: "auth:code:hash",
				stringValue: "123",
				expirationSeconds: 900,
			},
			errorMessage: "hashFields must not contain an empty Redis hash field name",
		},
		{
			description: "a zero expiration",
			params: {
				hashKey: "auth:intent:123",
				hashFields: { code_hash: "hash" },
				stringKey: "auth:code:hash",
				stringValue: "123",
				expirationSeconds: 0,
			},
			errorMessage: "expirationSeconds must be a positive integer",
		},
		{
			description: "a fractional expiration",
			params: {
				hashKey: "auth:intent:123",
				hashFields: { code_hash: "hash" },
				stringKey: "auth:code:hash",
				stringValue: "123",
				expirationSeconds: 1.5,
			},
			errorMessage: "expirationSeconds must be a positive integer",
		},
	])("should reject $description before contacting Redis", async ({ params, errorMessage }) => {
		await expect(redisService.createHashAndStringIfNeitherExists(params)).rejects.toThrow(errorMessage);
	});
});
