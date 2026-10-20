import * as td from "testdouble";
import { Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { RateLimitedError } from "../errors/rate-limited.error";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

afterEach(() => td.reset());

describe("RedisThrottlerStorage", () => {
	let redis: RedisService;

	let storage: RedisThrottlerStorage;

	beforeEach(() => {
		redis = td.object<RedisService>();
		storage = new RedisThrottlerStorage(redis);
	});

	it("should return the atomic Redis sliding-window result", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve([
			4, 37, 0, 0,
		]);

		const result = await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(result).toEqual({
			totalHits: 4,
			timeToExpire: 37,
			isBlocked: false,
			timeToBlockExpire: 0,
		});
	});

	it("should report a request blocked until the oldest accepted request expires", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve([
			6, 42, 1, 42,
		]);

		const result = await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(result).toEqual({ totalHits: 6, timeToExpire: 42, isBlocked: true, timeToBlockExpire: 42 });
	});

	it("should isolate accepted requests under a throttler-specific Redis key", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve([
			1, 60, 0, 0,
		]);

		await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(td.explain(redis.eval).calls[0]?.args).toEqual([
			expect.stringContaining('redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - ttlMilliseconds)'),
			["rate-limit:default:request-timestamps-by-key:request-key"],
			["60000", "5", expect.any(String)],
		]);
	});

	it("should not add a blocked request to the sliding window", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve([
			6, 42, 1, 42,
		]);

		await storage.increment("request-key", 60_000, 5, 60_000, "default");

		expect(td.explain(redis.eval).calls[0]?.args).toEqual([
			expect.stringContaining("if totalHits >= limit then"),
			expect.any(Array),
			expect.any(Array),
		]);
	});

	it("should fail closed with the common rate-limit error when Redis cannot enforce the limit", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReject(
			new Error("Redis unavailable"),
		);
		td.replace(Logger.prototype, "error");

		await expect(storage.increment("request-key", 60_000, 5, 60_000, "default")).rejects.toThrow(RateLimitedError);
	});

	it("should log the Redis failure without allowing the protected operation", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReject(
			new Error("Redis unavailable"),
		);
		const logError = td.replace(Logger.prototype, "error");

		await storage.increment("request-key", 60_000, 5, 60_000, "default").catch(() => undefined);

		td.verify(logError("The Redis-backed rate limit is unavailable; the protected request was rejected."));
	});
});
