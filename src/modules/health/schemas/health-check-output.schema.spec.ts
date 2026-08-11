import { HealthCheckStatus } from "../enums/health-check-status.enum";
import { HealthIndicatorStatus } from "../enums/health-indicator-status.enum";
import { HealthCheckOutputSchema } from "./health-check-output.schema";

describe("HealthCheckOutputSchema", () => {
	it("should serialize every dependency detail", () => {
		const output = {
			status: HealthCheckStatus.ERROR,
			details: {
				database: { status: HealthIndicatorStatus.UP },
				redis: { status: HealthIndicatorStatus.DOWN, message: "Connection refused" },
			},
		};

		expect(HealthCheckOutputSchema.parse(output)).toEqual(output);
	});
});
