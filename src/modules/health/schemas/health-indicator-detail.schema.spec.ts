import { HealthIndicatorStatus } from "../enums/health-indicator-status.enum";
import { HealthIndicatorDetailSchema } from "./health-indicator-detail.schema";

describe("HealthIndicatorDetailSchema", () => {
	it("should serialize a health indicator without an optional message", () => {
		expect(HealthIndicatorDetailSchema.parse({ status: HealthIndicatorStatus.UP })).toEqual({ status: "up" });
	});
});
