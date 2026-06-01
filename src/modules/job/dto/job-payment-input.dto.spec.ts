import { validate } from "class-validator";
import { JobPaymentInputDto } from "./job-payment-input.dto";
import { JobPaymentAmountPeriod } from "../../../../generated/prisma/client.js";

describe("JobPaymentInputDto", () => {
	describe("field validation", () => {
		it("should pass with valid payment data", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with zero minAmount", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with negative minAmount", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: -50, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with invalid type", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "INVALID" as never, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "type")).toBe(true);
		});

		it("should fail with invalid amountPeriod", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, amountPeriod: "INVALID" as never, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "amountPeriod")).toBe(true);
		});

		it("should fail with invalid currency", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "INVALID" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "currency")).toBe(true);
		});

		it("should fail when minAmount exceeds database decimal limit", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 100000000.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when maxAmount exceeds database decimal limit", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "RANGE", minAmount: 150.0, maxAmount: 100000000.0, amountPeriod: JobPaymentAmountPeriod.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
