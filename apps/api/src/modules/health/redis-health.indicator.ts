import { Injectable, Logger } from "@nestjs/common";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import {
	getDevelopmentErrorLogFields,
	getSafeErrorTelemetryFields,
} from "../../core/observability/safe-error-telemetry";
import { RedisService } from "../../core/redis/redis.service";

@Injectable()
export class RedisHealthIndicator {
	private readonly _logger = new Logger(RedisHealthIndicator.name);

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
		} catch (error: unknown) {
			this._logger.error({
				event: ObservabilityEventConstants.API_HEALTH_REDIS_FAILED_EVENT,
				outcome: "DOWN",
				...getSafeErrorTelemetryFields({ error: error }),
				...(process.env["NODE_ENV"] === "development" ? getDevelopmentErrorLogFields({ error: error }) : {}),
			});
			return check.down("Redis connection failed");
		}
	}
}
