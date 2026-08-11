import { z } from "zod";
import { HealthIndicatorStatus } from "../enums/health-indicator-status.enum";

export const HealthIndicatorDetailSchema = z
	.object({
		status: z.enum(HealthIndicatorStatus).describe("Status of the dependency"),
		message: z.string().optional().describe("Error message when the dependency is down"),
	})
	.strict()
	.meta({ id: "HealthIndicatorDetail" });
