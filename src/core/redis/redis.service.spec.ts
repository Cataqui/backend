import { Test } from "@nestjs/testing";
import { type IUpstashRedisConfig, upstashRedisConfig } from "../config/upstash-redis.config";
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
					provide: upstashRedisConfig.KEY,
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
});
