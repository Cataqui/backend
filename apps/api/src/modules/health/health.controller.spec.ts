/* eslint-disable @typescript-eslint/unbound-method */

import { HealthCheckService, TerminusModule } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import type { FastifyReply } from "fastify";
import * as td from "testdouble";
import { PrismaService } from "../../core/prisma/prisma.service";
import { HealthCheckStatus } from "./enums/health-check-status.enum";
import { HealthIndicatorStatus } from "./enums/health-indicator-status.enum";
import { HealthController } from "./health.controller";
import { RedisHealthIndicator } from "./redis-health.indicator";

afterEach(() => td.reset());

describe("HealthController", () => {
	let controller: HealthController;
	let healthCheckService: HealthCheckService;
	let mockReply: FastifyReply;

	beforeEach(async () => {
		mockReply = td.object<FastifyReply>();
		td.when(mockReply.status(td.matchers.anything())).thenReturn(mockReply);
		td.when(mockReply.header(td.matchers.anything(), td.matchers.anything())).thenReturn(mockReply);
		healthCheckService = td.object<HealthCheckService>();

		const module = await Test.createTestingModule({
			imports: [TerminusModule],
			controllers: [HealthController],
			providers: [
				{
					provide: RedisHealthIndicator,
					useValue: td.object<RedisHealthIndicator>(),
				},
				{
					provide: PrismaService,
					useValue: td.object<PrismaService>(),
				},
			],
		})
			.overrideProvider(HealthCheckService)
			.useValue(healthCheckService)
			.compile();

		controller = module.get(HealthController);
	});

	it("should return healthy output when all dependencies are up", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "ok",
			details: { database: { status: "up" } },
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result).toEqual({ status: HealthCheckStatus.OK, details: { database: { status: "up" } } });
	});

	it("should register both database and Redis readiness checks", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "ok",
			details: {
				database: { status: "up" },
				redis: { status: "up" },
			},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		await controller.check(mockReply);

		expect(td.explain(healthCheckService.check).calls[0]?.args[0]).toHaveLength(2);
	});

	it("should not check dependencies for process liveness", () => {
		controller.liveness();

		td.verify(healthCheckService.check(td.matchers.anything()), { times: 0 });
	});

	describe("when a dependency is down", () => {
		it("should return error status", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				details: { database: { status: "down", message: "Can't connect to database" } },
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for database indicator", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				details: { database: { status: "down", message: "Can't connect to database" } },
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return generic database connection failed message", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				details: { database: { status: "down", message: "Can't connect to database" } },
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.details["database"]?.message).toBe("Database connection failed");
		});

		it("should set response status to 503", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				details: { database: { status: "down", message: "Can't connect to database" } },
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			await controller.check(mockReply);
			expect(td.explain(mockReply.status).calls[0]?.args).toEqual([503]);
		});
	});

	describe("when health check throws unexpectedly", () => {
		it("should return error status", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenReject(new Error("Unexpected error"));

			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for error detail", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenReject(new Error("Unexpected error"));

			const result = await controller.check(mockReply);
			expect(result.details["error"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return a generic dependency health failure message", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenReject(new Error("Unexpected error"));

			const result = await controller.check(mockReply);
			expect(result.details["error"]?.message).toBe("Dependency health check failed");
		});

		it("should set response status to 503", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenReject(new Error("Unexpected error"));

			await controller.check(mockReply);
			expect(td.explain(mockReply.status).calls[0]?.args).toEqual([503]);
		});
	});

	it("should preserve every dependency in health details", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
				cache: { status: "up" },
			},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(Object.keys(result.details)).toHaveLength(3);
	});

	it("should preserve a healthy database status among multiple dependencies", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
				cache: { status: "up" },
			},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.UP);
	});

	it("should preserve a failed Redis status among multiple dependencies", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
				cache: { status: "up" },
			},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result.details["redis"]?.status).toBe(HealthIndicatorStatus.DOWN);
	});

	it("should preserve a healthy cache status among multiple dependencies", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
				cache: { status: "up" },
			},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result.details["cache"]?.status).toBe(HealthIndicatorStatus.UP);
	});

	it("should set cache-control header", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "ok",
			details: { database: { status: "up" } },
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		await controller.check(mockReply);

		expect(td.explain(mockReply.header).calls[0]?.args).toEqual([
			"Cache-Control",
			"no-cache, no-store, must-revalidate",
		]);
	});

	describe("when details is empty and fallback to error field is used", () => {
		it("should return error status", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				info: {},
				error: { database: { status: "down", message: "Timeout" } },
				details: {},
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for database indicator", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				info: {},
				error: { database: { status: "down", message: "Timeout" } },
				details: {},
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return generic database connection failed message", async () => {
			td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
				status: "error",
				info: {},
				error: { database: { status: "down", message: "Timeout" } },
				details: {},
			} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

			const result = await controller.check(mockReply);
			expect(result.details["database"]?.message).toBe("Database connection failed");
		});
	});

	it("should report an error when health details and the error field are absent", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result.status).toBe(HealthCheckStatus.ERROR);
	});

	it("should return empty health details when the error field is absent", async () => {
		td.when(healthCheckService.check(td.matchers.anything())).thenResolve({
			status: "error",
			details: {},
		} satisfies Partial<Awaited<ReturnType<HealthCheckService["check"]>>>);

		const result = await controller.check(mockReply);

		expect(result.details).toEqual({});
	});
});
