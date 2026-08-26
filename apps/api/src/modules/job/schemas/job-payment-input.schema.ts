import { z } from "zod";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";

export const JobPaymentInputSchema = z
	.object({
		type: z
			.enum(JobPaymentType)
			.describe("Defines the type of payment that the worker will receive for the job upon completion"),
		minAmount: z
			.number()
			.positive()
			.max(99_999_999.99)
			.multipleOf(0.01, { error: "payment.minAmount must contain at most two decimal places. Example: 150.25" })
			.optional()
			.describe("Minimum payment amount for the job offer (required for FIXED and RANGE)"),
		maxAmount: z
			.number()
			.positive()
			.max(99_999_999.99)
			.multipleOf(0.01, { error: "payment.maxAmount must contain at most two decimal places. Example: 200.50" })
			.optional()
			.describe("Maximum payment amount for the job offer (required for RANGE)"),
		note: z
			.string()
			.min(1)
			.max(500)
			.optional()
			.describe(
				"Note related to the payment, e.g. how it will be done, or any additional details (required when type is OTHER)",
			),
		amountPeriod: z
			.enum(JobPaymentAmountPeriod)
			.describe(
				"The period of the payment amount, e.g. if the payment amount is daily, weekly, monthly, etc. (e.g. $20/day, $100/week, etc.)",
			),
		currency: z
			.string()
			.refine((currency) => Intl.supportedValuesOf("currency").includes(currency), {
				error: "currency must be an ISO 4217 currency code. Example: BRL",
			})
			.describe("Currency code (ISO 4217)"),
	})
	.strict()
	.superRefine((payment, context) => {
		switch (payment.type) {
			case JobPaymentType.FIXED:
				if (payment.minAmount === undefined) {
					context.addIssue({
						code: "custom",
						message:
							'payment.minAmount is required when payment.type is FIXED. Example: { "type": "FIXED", "minAmount": 150 }.',
						path: ["minAmount"],
					});
				}

				if (payment.maxAmount !== undefined) {
					context.addIssue({
						code: "custom",
						message:
							'payment.maxAmount must be omitted when payment.type is FIXED. Example: { "type": "FIXED", "minAmount": 150 }.',
						path: ["maxAmount"],
					});
				}
				return;
			case JobPaymentType.RANGE:
				if (payment.minAmount === undefined || payment.maxAmount === undefined) {
					context.addIssue({
						code: "custom",
						message:
							'payment.minAmount and payment.maxAmount are required when payment.type is RANGE. Example: { "type": "RANGE", "minAmount": 100, "maxAmount": 200 }.',
						path: [payment.minAmount === undefined ? "minAmount" : "maxAmount"],
					});
					return;
				}

				if (payment.maxAmount <= payment.minAmount) {
					context.addIssue({
						code: "custom",
						message:
							'payment.maxAmount must be greater than payment.minAmount when payment.type is RANGE. Example: { "type": "RANGE", "minAmount": 100, "maxAmount": 200 }.',
						path: ["maxAmount"],
					});
				}
				return;
			case JobPaymentType.FLEXIBLE:
				if (payment.minAmount !== undefined || payment.maxAmount !== undefined) {
					context.addIssue({
						code: "custom",
						message:
							'payment.minAmount and payment.maxAmount must be omitted when payment.type is FLEXIBLE. Example: { "type": "FLEXIBLE" }.',
						path: [payment.minAmount !== undefined ? "minAmount" : "maxAmount"],
					});
				}
				return;
			case JobPaymentType.OTHER:
				if (payment.minAmount !== undefined || payment.maxAmount !== undefined) {
					context.addIssue({
						code: "custom",
						message:
							'payment.minAmount and payment.maxAmount must be omitted when payment.type is OTHER. Example: { "type": "OTHER", "note": "Commission-based" }.',
						path: [payment.minAmount !== undefined ? "minAmount" : "maxAmount"],
					});
				}

				if (payment.note === undefined || payment.note.trim().length === 0) {
					context.addIssue({
						code: "custom",
						message:
							'payment.note must explain the arrangement when payment.type is OTHER. Example: { "type": "OTHER", "note": "Commission-based" }.',
						path: ["note"],
					});
				}
				return;
		}
	})
	.meta({ id: "JobPaymentInput" });
