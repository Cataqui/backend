import { registerAs } from "@nestjs/config";

export const UPSTASH_REDIS_CONFIG_KEY = "upstashRedis";

export interface IUpstashRedisConfig {
	restUrl: string;
	restToken: string;
}

export const upstashRedisConfig = registerAs(
	UPSTASH_REDIS_CONFIG_KEY,
	(): IUpstashRedisConfig => ({
		restUrl: process.env["UPSTASH_REDIS_REST_URL"]!,
		restToken: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
	}),
);
