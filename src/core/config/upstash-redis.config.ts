import { registerAs } from "@nestjs/config";

export interface IUpstashRedisConfig {
	restUrl: string;
	restToken: string;
}

export const upstashRedisConfig = registerAs(
	"upstashRedis",
	(): IUpstashRedisConfig => ({
		restUrl: process.env["UPSTASH_REDIS_REST_URL"]!,
		restToken: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
	}),
);
