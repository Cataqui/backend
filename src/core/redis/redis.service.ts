import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "@upstash/redis";
import { type IUpstashRedisConfig, UPSTASH_REDIS_CONFIG_KEY } from "../config/upstash-redis.config";

@Injectable()
export class RedisService extends Redis {
	constructor(@Inject(UPSTASH_REDIS_CONFIG_KEY) config: IUpstashRedisConfig) {
		super({
			url: config.restUrl,
			token: config.restToken,
		});
	}

	async createHashAndStringIfNeitherExists(params: {
		hashKey: string;
		hashFields: Record<string, string>;
		stringKey: string;
		stringValue: string;
		expirationSeconds: number;
	}): Promise<boolean> {
		if (params.hashKey.trim().length === 0) {
			throw new TypeError("hashKey must be a non-empty Redis key");
		}

		if (params.stringKey.trim().length === 0) {
			throw new TypeError("stringKey must be a non-empty Redis key");
		}

		if (params.hashKey === params.stringKey) {
			throw new TypeError("hashKey and stringKey must identify different Redis records");
		}

		const hashFieldEntries = Object.entries(params.hashFields);

		if (hashFieldEntries.length === 0) {
			throw new TypeError("hashFields must contain at least one Redis hash field");
		}

		if (hashFieldEntries.some(([fieldName]) => fieldName.trim().length === 0)) {
			throw new TypeError("hashFields must not contain an empty Redis hash field name");
		}

		if (!Number.isInteger(params.expirationSeconds) || params.expirationSeconds <= 0) {
			throw new RangeError("expirationSeconds must be a positive integer");
		}

		const result = await this.eval<string[], number>(
			`
				if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
					return 0
				end

				for index = 3, #ARGV, 2 do
					redis.call("HSET", KEYS[1], ARGV[index], ARGV[index + 1])
				end

				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
				redis.call("SET", KEYS[2], ARGV[2], "EX", tonumber(ARGV[1]))

				return 1
			`,
			[params.hashKey, params.stringKey],
			[String(params.expirationSeconds), params.stringValue, ...hashFieldEntries.flat()],
		);

		return result === 1;
	}
}
