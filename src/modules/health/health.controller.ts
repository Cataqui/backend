import { Controller, Get, Version, Res, HttpStatus, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { SkipEnvelope } from "../../shared/decorators/skip-envelope.decorator";
import { HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import { PrismaService } from "../../core/prisma/prisma.service";
import { HealthCheckOutputDto, HealthIndicatorDetailDto } from "./dto/health-check-output.dto";
import { HealthCheckStatus } from "./enums/health-check-status.enum";
import { HealthIndicatorStatus } from "./enums/health-indicator-status.enum";
import type { FastifyReply } from "fastify";

@ApiTags("health")
@Controller("health")
export class HealthController {
	private readonly _logger = new Logger(HealthController.name);

	constructor(
		private readonly _health: HealthCheckService,
		private readonly _prismaHealth: PrismaHealthIndicator,
		private readonly _prisma: PrismaService,
	) {}

	@Get()
	@Version("1")
	@SkipEnvelope()
	@ApiOperation({ summary: "Health check endpoint" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: HealthCheckOutputDto,
		description: "All services are healthy",
	})
	@ApiResponse({
		status: HttpStatus.SERVICE_UNAVAILABLE,
		description: "One or more services are unhealthy",
	})
	async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthCheckOutputDto> {
		let healthStatus: HealthCheckStatus;
		let details: Record<string, HealthIndicatorDetailDto>;

		try {
			const result = await this._health.check([() => this._prismaHealth.pingCheck("database", this._prisma)]);

			healthStatus = result.status as HealthCheckStatus;

			const source = Object.keys(result.details).length > 0 ? result.details : (result.error ?? {});

			details = {};

			for (const [key, val] of Object.entries(source)) {
				const status = (val as { status: string })["status"] as HealthIndicatorStatus;
				let message = (val as { message?: string })["message"];

				if (key === "database" && status !== HealthIndicatorStatus.UP) {
					message = "Database connection failed";
				}

				details[key] = new HealthIndicatorDetailDto(status, message);
			}
		} catch (error) {
			this._logger.error("Health check failed", error);

			healthStatus = HealthCheckStatus.ERROR;
			details = {
				error: new HealthIndicatorDetailDto(HealthIndicatorStatus.DOWN, "Database connection failed"),
			};
		}

		if (healthStatus !== HealthCheckStatus.OK) reply.status(HttpStatus.SERVICE_UNAVAILABLE);

		reply.header("Cache-Control", "no-cache, no-store, must-revalidate");

		return new HealthCheckOutputDto(healthStatus, details);
	}
}
