import { validate } from "class-validator";
import { JobPaymentInputDto } from "./job-payment-input.dto";
import { JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

describe("JobPaymentInputDto", () => {
	describe("field validation", () => {
		it("should pass with valid payment data", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with zero minAmount", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with negative minAmount", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: -50, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with invalid type", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "INVALID" as never, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "type")).toBe(true);
		});

		it("should fail with invalid recurrence", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, recurrence: "INVALID" as never, currency: "BRL" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "recurrence")).toBe(true);
		});

		it("should fail with invalid currency", async () => {
			const data: Partial<JobPaymentInputDto> = { type: "FIXED", minAmount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "INVALID" };
			const dto = Object.assign(new JobPaymentInputDto(), data);
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => e.property === "currency")).toBe(true);
		});
	});
});
