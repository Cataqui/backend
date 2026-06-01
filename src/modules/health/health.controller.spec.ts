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

	describe("when a dependency is down", () => {
		beforeEach(() => {
			vi.spyOn(healthCheckService, "check").mockResolvedValue({
				status: "error",
				details: { database: { status: "down", message: "Can't connect to database" } },
			} as never);
		});

		it("should return error status", async () => {
			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for database indicator", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return generic database connection failed message", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["database"]?.message).toBe("Database connection failed");
		});

		it("should set response status to 503", async () => {
			await controller.check(mockReply);
			expect(mockReply.status).toHaveBeenCalledWith(503);
		});
	});

	describe("when health check throws unexpectedly", () => {
		beforeEach(() => {
			vi.spyOn(healthCheckService, "check").mockRejectedValue(new Error("Unexpected error"));
		});

		it("should return error status", async () => {
			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for error detail", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["error"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return generic database connection failed message", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["error"]?.message).toBe("Database connection failed");
		});

		it("should set response status to 503", async () => {
			await controller.check(mockReply);
			expect(mockReply.status).toHaveBeenCalledWith(503);
		});
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

	describe("when details is empty and fallback to error field is used", () => {
		beforeEach(() => {
			vi.spyOn(healthCheckService, "check").mockResolvedValue({
				status: "error",
				info: {},
				error: { database: { status: "down", message: "Timeout" } },
				details: {},
			} as never);
		});

		it("should return error status", async () => {
			const result = await controller.check(mockReply);
			expect(result.status).toBe(HealthCheckStatus.ERROR);
		});

		it("should return down status for database indicator", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["database"]?.status).toBe(HealthIndicatorStatus.DOWN);
		});

		it("should return generic database connection failed message", async () => {
			const result = await controller.check(mockReply);
			expect(result.details["database"]?.message).toBe("Database connection failed");
		});
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
