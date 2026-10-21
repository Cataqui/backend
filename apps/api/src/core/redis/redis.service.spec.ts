import { Test } from "@nestjs/testing";
import * as td from "testdouble";
import { type IUpstashRedisConfig, upstashRedisConfig } from "../config/upstash-redis.config";
import { RedisService } from "./redis.service";

afterEach(() => td.reset());

const _redis = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { construct: td.func<(config: Record<string, unknown>) => void>() };
});

vi.mock("@upstash/redis", () => ({
	Redis: class {
		constructor(config: Record<string, unknown>) {
			_redis.construct(config);
		}
	},
}));

const MOCK_CONFIG: IUpstashRedisConfig = {
	restUrl: "https://example.upstash.io",
	restToken: "test-token",
};

describe("RedisService", () => {
	let redisService: RedisService;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [{ provide: upstashRedisConfig.KEY, useValue: MOCK_CONFIG }, RedisService],
		}).compile();
		redisService = module.get(RedisService);
	});

	it("should be available for dependency injection", () => {
		expect(redisService).toBeDefined();
	});

	it("should configure the Upstash client with the registered REST URL and token", () => {
		td.verify(_redis.construct({ url: MOCK_CONFIG.restUrl, token: MOCK_CONFIG.restToken }), { times: 1 });
	});
});
