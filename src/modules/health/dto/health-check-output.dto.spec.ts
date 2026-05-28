import { instanceToPlain } from "class-transformer";
import { HealthCheckOutputDto, HealthIndicatorDetailDto } from "./health-check-output.dto";
import { HealthCheckStatus } from "../enums/health-check-status.enum";
import { HealthIndicatorStatus } from "../enums/health-indicator-status.enum";

describe("HealthIndicatorDetailDto", () => {
	it("should create an instance with the given status", () => {
		const dto = new HealthIndicatorDetailDto(HealthIndicatorStatus.UP);
		expect(dto.status).toBe(HealthIndicatorStatus.UP);
	});

	it("should create an instance with status and message", () => {
		const dto = new HealthIndicatorDetailDto(HealthIndicatorStatus.DOWN, "Can't connect to database");
		expect(dto.status).toBe(HealthIndicatorStatus.DOWN);
		expect(dto.message).toBe("Can't connect to database");
	});

	it("should serialize to plain object with status field", () => {
		const dto = new HealthIndicatorDetailDto(HealthIndicatorStatus.DOWN);
		const plain = instanceToPlain(dto);
		expect(plain).toEqual({ status: "down" });
	});

	it("should serialize message when present", () => {
		const dto = new HealthIndicatorDetailDto(HealthIndicatorStatus.DOWN, "Connection refused");
		const plain = instanceToPlain(dto);
		expect(plain).toEqual({ status: "down", message: "Connection refused" });
	});
});

describe("HealthCheckOutputDto", () => {
	it("should create an instance with status and details", () => {
		const details = {
			database: new HealthIndicatorDetailDto(HealthIndicatorStatus.UP),
		};
		const dto = new HealthCheckOutputDto(HealthCheckStatus.OK, details);
		expect(dto.status).toBe(HealthCheckStatus.OK);
		expect(dto.details["database"]?.status).toBe(HealthIndicatorStatus.UP);
	});

	it("should serialize to plain object with status and details", () => {
		const details = {
			database: new HealthIndicatorDetailDto(HealthIndicatorStatus.UP),
		};
		const dto = new HealthCheckOutputDto(HealthCheckStatus.OK, details);
		const plain = instanceToPlain(dto);
		expect(plain).toEqual({
			status: "ok",
			details: { database: { status: "up" } },
		});
	});

	it("should handle empty details", () => {
		const dto = new HealthCheckOutputDto(HealthCheckStatus.ERROR, {});
		expect(dto.status).toBe(HealthCheckStatus.ERROR);
		expect(dto.details).toEqual({});
	});

	it("should handle multiple dependencies in details", () => {
		const details = {
			database: new HealthIndicatorDetailDto(HealthIndicatorStatus.UP),
			redis: new HealthIndicatorDetailDto(HealthIndicatorStatus.DOWN),
		};
		const dto = new HealthCheckOutputDto(HealthCheckStatus.ERROR, details);
		const plain = instanceToPlain(dto);
		expect(plain).toEqual({
			status: "error",
			details: {
				database: { status: "up" },
				redis: { status: "down" },
			},
		});
	});
});
