import { HealthIndicatorService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { RedisService } from "../../core/redis/redis.service";
import { RedisHealthIndicator } from "./redis-health.indicator";

describe("RedisHealthIndicator", () => {
	let redisHealthIndicator: RedisHealthIndicator;
	let redisService: RedisService;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				HealthIndicatorService,
				RedisHealthIndicator,
				{
					provide: RedisService,
					useValue: { ping: vi.fn() },
				},
			],
		}).compile();

		redisHealthIndicator = module.get(RedisHealthIndicator);
		redisService = module.get(RedisService);
	});

	it("should report Redis as up when Upstash answers PONG", async () => {
		vi.spyOn(redisService, "ping").mockResolvedValue("PONG");

		const result = await redisHealthIndicator.pingCheck();

		expect(result).toEqual({ redis: { status: "up" } });
	});

	it("should report Redis as down when Upstash returns an unexpected response", async () => {
		vi.spyOn(redisService, "ping").mockResolvedValue("unexpected");

		const result = await redisHealthIndicator.pingCheck();

		expect(result).toEqual({ redis: { message: "Redis connection failed", status: "down" } });
	});

	it("should report Redis as down without leaking provider errors", async () => {
		vi.spyOn(redisService, "ping").mockRejectedValue(new Error("private Upstash details"));

		const result = await redisHealthIndicator.pingCheck();

		expect(result).toEqual({ redis: { message: "Redis connection failed", status: "down" } });
	});
});
