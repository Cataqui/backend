import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "@upstash/redis";
import { type IUpstashRedisConfig, upstashRedisConfig } from "../config/upstash-redis.config";

@Injectable()
export class RedisService extends Redis {
	constructor(@Inject(upstashRedisConfig.KEY) config: IUpstashRedisConfig) {
		super({
			url: config.restUrl,
			token: config.restToken,
		});
	}
}
