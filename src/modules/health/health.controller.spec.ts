/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { HealthCheckService, TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PrismaService } from "../../core/prisma/prisma.service";
import { HealthCheckOutputDto } from "./dto/health-check-output.dto";
import { HealthCheckStatus } from "./enums/health-check-status.enum";
import { HealthIndicatorStatus } from "./enums/health-indicator-status.enum";
import type { FastifyReply } from "fastify";

describe("HealthController", () => {
	let controller: HealthController;
	let healthCheckService: HealthCheckService;
	let mockReply: FastifyReply;

	beforeEach(async () => {
		mockReply = {
			status: vi.fn().mockReturnThis(),
			header: vi.fn().mockReturnThis(),
		} as unknown as FastifyReply;

		const module = await Test.createTestingModule({
			imports: [TerminusModule],
			controllers: [HealthController],
			providers: [
				{
					provide: PrismaService,
					useValue: {
						$connect: vi.fn(),
						$disconnect: vi.fn(),
					},
				},
			],
		}).compile();

		controller = module.get(HealthController);
		healthCheckService = module.get(HealthCheckService);
	});

	it("should return healthy output when all dependencies are up", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "ok",
			details: { database: { status: "up" } },
		} as never);

		const result = await controller.check(mockReply);

		expect(result).toBeInstanceOf(HealthCheckOutputDto);
		expect(result.status).toBe(HealthCheckStatus.OK);
		expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.UP);
		expect(mockReply.header).toHaveBeenCalledWith("Cache-Control", "no-cache, no-store, must-revalidate");
	});

	it("should return unhealthy output when a dependency is down", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "error",
			details: { database: { status: "down", message: "Can't connect to database" } },
		} as never);

		const result = await controller.check(mockReply);

		expect(result.status).toBe(HealthCheckStatus.ERROR);
		expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		expect(result.details["database"]?.message).toBe("Can't connect to database");
		expect(mockReply.status).toHaveBeenCalledWith(503);
	});

	it("should return error output when health check throws unexpectedly", async () => {
		vi.spyOn(healthCheckService, "check").mockRejectedValue(new Error("Unexpected error"));

		const result = await controller.check(mockReply);

		expect(result.status).toBe(HealthCheckStatus.ERROR);
		expect(result.details["error"]?.status).toBe(HealthIndicatorStatus.DOWN);
		expect(result.details["error"]?.message).toBe("Unexpected error");
		expect(mockReply.status).toHaveBeenCalledWith(503);
	});

	it("should map multiple dependencies in details", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
				cache: { status: "up" },
			},
		} as never);

		const result = await controller.check(mockReply);

		expect(Object.keys(result.details)).toHaveLength(3);
		expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.UP);
		expect(result.details["redis"]?.status).toBe(HealthIndicatorStatus.DOWN);
		expect(result.details["cache"]?.status).toBe(HealthIndicatorStatus.UP);
	});

	it("should set cache-control header", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "ok",
			details: { database: { status: "up" } },
		} as never);

		await controller.check(mockReply);

		expect(mockReply.header).toHaveBeenCalledWith("Cache-Control", "no-cache, no-store, must-revalidate");
	});

	it("should fall back to error field when details is empty", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "error",
			info: {},
			error: { database: { status: "down", message: "Timeout" } },
			details: {},
		} as never);

		const result = await controller.check(mockReply);

		expect(result.status).toBe(HealthCheckStatus.ERROR);
		expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		expect(result.details["database"]?.message).toBe("Timeout");
	});

	it("should handle empty details with no error field", async () => {
		vi.spyOn(healthCheckService, "check").mockResolvedValue({
			status: "error",
			details: {},
		} as never);

		const result = await controller.check(mockReply);

		expect(result.status).toBe(HealthCheckStatus.ERROR);
		expect(result.details).toEqual({});
	});
});
