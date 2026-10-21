import { Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { randomUUID } from "node:crypto";
import { RateLimitedError } from "../errors/rate-limited.error";
import { RedisService } from "../redis/redis.service";

export class RedisThrottlerStorage implements ThrottlerStorage {
	constructor(private readonly _redis: RedisService) {}

	private readonly _logger = new Logger(RedisThrottlerStorage.name);

	async increment(
		requestKey: string,
		ttlMilliseconds: number,
		limit: number,
		blockDurationMilliseconds: number,
		throttlerName: string,
	): Promise<ThrottlerStorageRecord> {
		void blockDurationMilliseconds;

		try {
			const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = await this._redis.eval<
				string[],
				[number, number, number, number]
			>(
				`
					local ttlMilliseconds = tonumber(ARGV[1])
					local limit = tonumber(ARGV[2])
					local redisTime = redis.call("TIME")
					local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)

					redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - ttlMilliseconds)

					local totalHits = redis.call("ZCARD", KEYS[1])
					local oldestRequest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
					local timeToExpireMilliseconds = ttlMilliseconds

					if oldestRequest[2] then
						timeToExpireMilliseconds = math.max(0, tonumber(oldestRequest[2]) + ttlMilliseconds - now)
					end

					if totalHits >= limit then
						return {
							totalHits + 1,
							math.ceil(timeToExpireMilliseconds / 1000),
							1,
							math.ceil(timeToExpireMilliseconds / 1000)
						}
					end

					redis.call("ZADD", KEYS[1], now, tostring(now) .. ":" .. ARGV[3])
					redis.call("PEXPIRE", KEYS[1], ttlMilliseconds)

					return {
						totalHits + 1,
						math.ceil(timeToExpireMilliseconds / 1000),
						0,
						0
					}
				`,
				[`rate-limit:${throttlerName}:request-timestamps-by-key:${requestKey}`],
				[String(ttlMilliseconds), String(limit), randomUUID()],
			);

			return {
				totalHits: totalHits,
				timeToExpire: timeToExpire,
				isBlocked: isBlocked === 1,
				timeToBlockExpire: timeToBlockExpire,
			};
		} catch {
			this._logger.error("The Redis-backed rate limit is unavailable; the protected request was rejected.");

			throw new RateLimitedError();
		}
	}
}
