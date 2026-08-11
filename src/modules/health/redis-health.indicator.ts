import { Injectable } from "@nestjs/common";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import { RedisService } from "../../core/redis/redis.service";

@Injectable()
export class RedisHealthIndicator {
	constructor(
		private readonly _redis: RedisService,
		private readonly _healthIndicator: HealthIndicatorService,
	) {}

	async pingCheck(): Promise<HealthIndicatorResult> {
		const check = this._healthIndicator.check("redis");

		try {
			const response = await this._redis.ping();

			if (response !== "PONG") return check.down("Redis connection failed");

			return check.up();
		} catch {
			return check.down("Redis connection failed");
		}
	}
}
