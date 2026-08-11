import { Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { RateLimitedError } from "../errors/rate-limited.error";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

describe("RedisThrottlerStorage", () => {
	const redis = {
		eval: vi.fn(),
	};

	let storage: RedisThrottlerStorage;

	beforeEach(() => {
		vi.clearAllMocks();
		storage = new RedisThrottlerStorage(redis as unknown as RedisService);
	});

	it("should return the atomic Redis sliding-window result", async () => {
		redis.eval.mockResolvedValue([4, 37, 0, 0]);

		const result = await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(result).toEqual({
			totalHits: 4,
			timeToExpire: 37,
			isBlocked: false,
			timeToBlockExpire: 0,
		});
	});

	it("should report a request blocked until the oldest accepted request expires", async () => {
		redis.eval.mockResolvedValue([6, 42, 1, 42]);

		const result = await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(result).toEqual({ totalHits: 6, timeToExpire: 42, isBlocked: true, timeToBlockExpire: 42 });
	});

	it("should isolate accepted requests under a throttler-specific Redis key", async () => {
		redis.eval.mockResolvedValue([1, 60, 0, 0]);

		await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - ttlMilliseconds)'),
			["rate-limit:default:request-timestamps-by-key:request-key"],
			["60000", "5", expect.any(String)],
		);
	});

	it("should not add a blocked request to the sliding window", async () => {
		redis.eval.mockResolvedValue([6, 42, 1, 42]);

		await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("if totalHits >= limit then"),
			expect.any(Array),
			expect.any(Array),
		);
	});

	it("should fail closed with the common rate-limit error when Redis cannot enforce the limit", async () => {
		redis.eval.mockRejectedValue(new Error("Redis unavailable"));
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await expect(storage.increment("request-key", 60_000, 5, 60_000, "default")).rejects.toThrow(RateLimitedError);
	});

	it("should log the Redis failure without allowing the protected operation", async () => {
		redis.eval.mockRejectedValue(new Error("Redis unavailable"));
		const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await storage.increment("request-key", 60_000, 5, 60_000, "default").catch(() => undefined);

		expect(logError).toHaveBeenCalledWith(
			"The Redis-backed rate limit is unavailable; the protected request was rejected.",
		);
	});
});
