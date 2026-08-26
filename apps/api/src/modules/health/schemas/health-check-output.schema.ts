import { z } from "zod";
import { HealthCheckStatus } from "../enums/health-check-status.enum";
import { HealthIndicatorDetailSchema } from "./health-indicator-detail.schema";

export const HealthCheckOutputSchema = z
	.object({
		status: z.enum(HealthCheckStatus).describe("Overall health status of the system"),
		details: z.record(z.string(), HealthIndicatorDetailSchema).describe("Per-dependency health details"),
	})
	.strict()
	.meta({ id: "HealthCheckOutput" });
