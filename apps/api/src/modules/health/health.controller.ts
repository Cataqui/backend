import { Controller, Get, Header, HttpCode, HttpStatus, Logger, Res, SerializeOptions, Version } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import type { FastifyReply } from "fastify";
import type { z } from "zod";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SkipEnvelope } from "../../shared/decorators/skip-envelope.decorator";
import { Public } from "../authentication/decorators/public.decorator";
import { HealthCheckStatus } from "./enums/health-check-status.enum";
import { HealthIndicatorStatus } from "./enums/health-indicator-status.enum";
import { RedisHealthIndicator } from "./redis-health.indicator";
import { HealthCheckOutputSchema } from "./schemas/health-check-output.schema";
import { HealthIndicatorDetailSchema } from "./schemas/health-indicator-detail.schema";

@ApiTags("health")
@Controller("health")
export class HealthController {
	private readonly _logger = new Logger(HealthController.name);

	constructor(
		private readonly _health: HealthCheckService,
		private readonly _prismaHealth: PrismaHealthIndicator,
		private readonly _prisma: PrismaService,
		private readonly _redisHealth: RedisHealthIndicator,
	) {}

	@Public()
	@Get("live")
	@Version("1")
	@SkipEnvelope()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Header("Cache-Control", "no-cache, no-store, must-revalidate")
	@ApiOperation({ summary: "Process liveness probe" })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: "The API process is responding. This probe does not check external dependencies.",
	})
	liveness(): void {}

	@Public()
	@Get()
	@Version("1")
	@SkipEnvelope()
	@ApiOperation({ summary: "Dependency readiness probe" })
	@ApiResponse({
		status: HttpStatus.OK,
		standardSchema: HealthCheckOutputSchema,
		description: "All services are healthy",
		example: {
			status: HealthCheckStatus.OK,
			details: { database: { status: HealthIndicatorStatus.UP }, redis: { status: HealthIndicatorStatus.UP } },
		} satisfies z.output<typeof HealthCheckOutputSchema>,
	})
	@ApiResponse({
		status: HttpStatus.SERVICE_UNAVAILABLE,
		description: "One or more services are unhealthy",
		standardSchema: HealthCheckOutputSchema,
		example: {
			status: HealthCheckStatus.ERROR,
			details: {
				database: { status: HealthIndicatorStatus.DOWN, message: "Database connection failed" },
				redis: { status: HealthIndicatorStatus.UP },
			},
		} satisfies z.output<typeof HealthCheckOutputSchema>,
	})
	@SerializeOptions({ schema: HealthCheckOutputSchema })
	async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<z.infer<typeof HealthCheckOutputSchema>> {
		let healthStatus: HealthCheckStatus;
		let details: Record<string, z.infer<typeof HealthIndicatorDetailSchema>>;

		try {
			const result = await this._health.check([
				(): ReturnType<PrismaHealthIndicator["pingCheck"]> => this._prismaHealth.pingCheck("database", this._prisma),
				(): ReturnType<RedisHealthIndicator["pingCheck"]> => this._redisHealth.pingCheck(),
			]);

			healthStatus = result.status as HealthCheckStatus;

			const source = Object.keys(result.details).length > 0 ? result.details : (result.error ?? {});

			details = {};

			for (const [key, val] of Object.entries(source)) {
				const status = (val as { status: string })["status"] as HealthIndicatorStatus;
				let message = (val as { message?: string })["message"];

				if (key === "database" && status !== HealthIndicatorStatus.UP) {
					message = "Database connection failed";
				}

				details[key] = {
					status: status,
					...(message === undefined ? {} : { message: message }),
				};
			}
		} catch (error) {
			this._logger.error("Health check failed", error);

			healthStatus = HealthCheckStatus.ERROR;
			details = {
				error: {
					status: HealthIndicatorStatus.DOWN,
					message: "Dependency health check failed",
				},
			};
		}

		if (healthStatus !== HealthCheckStatus.OK) reply.status(HttpStatus.SERVICE_UNAVAILABLE);

		reply.header("Cache-Control", "no-cache, no-store, must-revalidate");

		return { status: healthStatus, details: details };
	}
}
