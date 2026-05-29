import { validate } from "class-validator";
import { CreateJobPaymentInputDto } from "./create-job-payment-input.dto";
import { JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

describe("CreateJobPaymentInputDto", () => {
	describe("validation", () => {
		it("should pass with valid payment data", async () => {
			const dto = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with zero amount", async () => {
			const dto = new CreateJobPaymentInputDto({ amount: 0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});

		it("should fail with negative amount", async () => {
			const dto = new CreateJobPaymentInputDto({ amount: -50, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});

		it("should fail with invalid recurrence", async () => {
			const dto = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: "INVALID" as never, currency: "BRL" });
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("recurrence");
		});

		it("should fail with invalid currency", async () => {
			const dto = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "INVALID" });
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("currency");
		});
	});
});
