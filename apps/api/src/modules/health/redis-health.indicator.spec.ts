import { Logger } from "@nestjs/common";
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

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
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
		const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		const result = await redisHealthIndicator.pingCheck();

		expect({
			leaksMessage: JSON.stringify(log.mock.calls).includes("private Upstash details"),
			logFields: log.mock.calls[0]?.[0],
			result: result,
		}).toEqual({
			leaksMessage: false,
			logFields: expect.objectContaining({
				errorName: "Error",
				errorStackFrames: expect.stringContaining("redis-health.indicator.spec.ts"),
				event: "api.health.redis.failed",
				outcome: "DOWN",
			}),
			result: { redis: { message: "Redis connection failed", status: "down" } },
		});
	});

	it("should include the complete Redis health failure in local development", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.spyOn(redisService, "ping").mockRejectedValue(new Error("Upstash health connection was refused"));
		const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await redisHealthIndicator.pingCheck();

		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				errorMessage: "Upstash health connection was refused",
				errorStack: expect.stringContaining("redis-health.indicator.spec.ts"),
			}),
		);
	});
});
