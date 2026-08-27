import { Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { randomUUID } from "node:crypto";
import { RateLimitEnforcementUnavailableError } from "../errors/rate-limit-enforcement-unavailable.error";
import { getDevelopmentErrorLogFields, getSafeErrorTelemetryFields } from "../observability/safe-error-telemetry";
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
				[this._buildRequestTimestampsRedisKey({ requestKey: requestKey, throttlerName: throttlerName })],
				[String(ttlMilliseconds), String(limit), randomUUID()],
			);

			return {
				totalHits: totalHits,
				timeToExpire: timeToExpire,
				isBlocked: isBlocked === 1,
				timeToBlockExpire: timeToBlockExpire,
			};
		} catch (error: unknown) {
			this._logger.error({
				event: ObservabilityEventConstants.API_RATE_LIMIT_ENFORCEMENT_FAILED_EVENT,
				outcome: "REJECTED",
				...getSafeErrorTelemetryFields({ error: error }),
				...(process.env["NODE_ENV"] === "development" ? getDevelopmentErrorLogFields({ error: error }) : {}),
			});

			throw new RateLimitEnforcementUnavailableError({ cause: error });
		}
	}

	private _buildRequestTimestampsRedisKey(params: { requestKey: string; throttlerName: string }): string {
		return `rate-limit:${params.throttlerName}:request-timestamps-by-key:${params.requestKey}`;
	}
}
