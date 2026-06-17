import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { HealthCheckStatus } from "../enums/health-check-status.enum";
import { HealthIndicatorStatus } from "../enums/health-indicator-status.enum";

@ApiExtraModels()
export class HealthIndicatorDetailDto {
	@Expose()
	@ApiProperty({
		enum: HealthIndicatorStatus,
		description: "Status of the dependency",
		example: "up",
	})
	readonly status: HealthIndicatorStatus;

	@Expose()
	@ApiProperty({
		description: "Error message when the dependency is down",
		example: "Can't connect to database",
		required: false,
	})
	readonly message?: string | undefined;

	constructor(status: HealthIndicatorStatus, message?: string) {
		this.status = status;
		this.message = message;
	}
}

export class HealthCheckOutputDto {
	@Expose()
	@ApiProperty({
		enum: HealthCheckStatus,
		description: "Overall health status of the system",
		example: "ok",
	})
	readonly status: HealthCheckStatus;

	@Expose()
	@ApiProperty({
		type: "object",
		additionalProperties: {
			$ref: getSchemaPath(HealthIndicatorDetailDto),
		},
		description: "Per-dependency health details",
		example: { database: { status: "up" } },
	})
	readonly details: Record<string, HealthIndicatorDetailDto>;

	constructor(status: HealthCheckStatus, details: Record<string, HealthIndicatorDetailDto>) {
		this.status = status;
		this.details = details;
	}
}
