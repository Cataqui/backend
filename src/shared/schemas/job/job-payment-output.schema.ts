import { z } from "zod";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

export const JobPaymentOutputSchema = z
	.object({
		type: z.enum(JobPaymentType).describe("Defines if the payment amount is fixed, flexible, etc."),
		minAmount: z.number().nullable().describe("Minimum payment amount for the job"),
		maxAmount: z.number().nullable().describe("Maximum payment amount for the job (in case of range)"),
		note: z
			.string()
			.nullable()
			.describe("A note related to the payment (e.g. how it will be done, or any additional details)"),
		amountPeriod: z
			.enum(JobPaymentAmountPeriod)
			.describe(
				"The period of the payment amount, if the payment amount is daily, weekly, monthly, etc. (e.g. $20/day, $100/week, etc.)",
			),
		currency: z.string().describe("Currency code (ISO 4217)"),
	})
	.strict()
	.meta({ id: "JobPaymentOutput" });
