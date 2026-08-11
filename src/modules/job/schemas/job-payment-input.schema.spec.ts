import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";
import { JobPaymentInputSchema } from "./job-payment-input.schema";

const basePayment = {
	amountPeriod: JobPaymentAmountPeriod.SINGLE,
	currency: "BRL",
};

describe("JobPaymentInputSchema", () => {
	it.each([
		{
			scenario: "a fixed amount",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: 150 },
		},
		{
			scenario: "a range",
			payment: { ...basePayment, type: JobPaymentType.RANGE, minAmount: 100, maxAmount: 200 },
		},
		{
			scenario: "a flexible amount",
			payment: { ...basePayment, type: JobPaymentType.FLEXIBLE },
		},
		{
			scenario: "another payment arrangement with an explanation",
			payment: { ...basePayment, type: JobPaymentType.OTHER, note: "Commission-based" },
		},
	])("should accept $scenario", ({ payment }) => {
		expect(JobPaymentInputSchema.safeParse(payment).success).toBe(true);
	});

	it.each([
		{
			scenario: "a fixed amount without minAmount",
			payment: { ...basePayment, type: JobPaymentType.FIXED },
		},
		{
			scenario: "a fixed amount with maxAmount",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: 100, maxAmount: 200 },
		},
		{
			scenario: "a range without minAmount",
			payment: { ...basePayment, type: JobPaymentType.RANGE, maxAmount: 200 },
		},
		{
			scenario: "a range without maxAmount",
			payment: { ...basePayment, type: JobPaymentType.RANGE, minAmount: 100 },
		},
		{
			scenario: "a range whose maxAmount equals minAmount",
			payment: { ...basePayment, type: JobPaymentType.RANGE, minAmount: 100, maxAmount: 100 },
		},
		{
			scenario: "a flexible payment with minAmount",
			payment: { ...basePayment, type: JobPaymentType.FLEXIBLE, minAmount: 100 },
		},
		{
			scenario: "a flexible payment with maxAmount",
			payment: { ...basePayment, type: JobPaymentType.FLEXIBLE, maxAmount: 200 },
		},
		{
			scenario: "another payment arrangement with minAmount",
			payment: { ...basePayment, type: JobPaymentType.OTHER, minAmount: 100, note: "Commission" },
		},
		{
			scenario: "another payment arrangement with maxAmount",
			payment: { ...basePayment, type: JobPaymentType.OTHER, maxAmount: 200, note: "Commission" },
		},
		{
			scenario: "another payment arrangement without a note",
			payment: { ...basePayment, type: JobPaymentType.OTHER },
		},
		{
			scenario: "another payment arrangement with a blank note",
			payment: { ...basePayment, type: JobPaymentType.OTHER, note: " " },
		},
	])("should reject $scenario from the request", ({ payment }) => {
		expect(JobPaymentInputSchema.safeParse(payment).success).toBe(false);
	});

	it.each([
		{
			scenario: "a zero minAmount",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: 0 },
		},
		{
			scenario: "a negative minAmount",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: -50 },
		},
		{
			scenario: "a minAmount above the database limit",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: 100_000_000 },
		},
		{
			scenario: "a maxAmount above the database limit",
			payment: {
				...basePayment,
				type: JobPaymentType.RANGE,
				minAmount: 150,
				maxAmount: 100_000_000,
			},
		},
		{
			scenario: "an unsupported payment type",
			payment: { ...basePayment, type: "INVALID" },
		},
		{
			scenario: "an unsupported amount period",
			payment: { type: JobPaymentType.FIXED, minAmount: 150, amountPeriod: "INVALID", currency: "BRL" },
		},
		{
			scenario: "an unsupported currency",
			payment: { ...basePayment, type: JobPaymentType.FIXED, minAmount: 150, currency: "INVALID" },
		},
	])("should reject the invalid transport shape for $scenario", ({ payment }) => {
		expect(JobPaymentInputSchema.safeParse(payment).success).toBe(false);
	});

	it.each(["minAmount", "maxAmount"] as const)("should reject %s with more than two decimal places", (field) => {
		const payment = {
			...basePayment,
			type: JobPaymentType.RANGE,
			minAmount: field === "minAmount" ? 100.001 : 100,
			maxAmount: field === "maxAmount" ? 200.001 : 200,
		};

		expect(JobPaymentInputSchema.safeParse(payment).success).toBe(false);
	});

	it("should accept an amount with exactly two decimal places", () => {
		const payment = { ...basePayment, type: JobPaymentType.FIXED, minAmount: 150.25 };

		expect(JobPaymentInputSchema.safeParse(payment).success).toBe(true);
	});
});
