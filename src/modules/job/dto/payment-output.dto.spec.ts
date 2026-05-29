import { instanceToPlain } from "class-transformer";
import { PaymentOutputDto } from "./payment-output.dto";
import { JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

describe("PaymentOutputDto", () => {
	describe("constructor", () => {
		it("should set fields from number amount", () => {
			const dto = new PaymentOutputDto({ paymentAmount: 150.0, paymentRecurrence: JobPaymentRecurrence.SINGLE, paymentCurrency: "BRL" });

			expect(dto.amount).toBe(150.0);
			expect(dto.recurrence).toBe(JobPaymentRecurrence.SINGLE);
			expect(dto.currency).toBe("BRL");
		});

		it("should extract amount from Decimal-like object", () => {
			const decimal = { toNumber: (): number => 250.0 };
			const dto = new PaymentOutputDto({ paymentAmount: decimal, paymentRecurrence: JobPaymentRecurrence.WEEKLY, paymentCurrency: "USD" });

			expect(dto.amount).toBe(250.0);
		});
	});

	describe("serialization", () => {
		it("should serialize all fields", () => {
			const dto = new PaymentOutputDto({ paymentAmount: 150.0, paymentRecurrence: JobPaymentRecurrence.SINGLE, paymentCurrency: "BRL" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				amount: 150.0,
				recurrence: "SINGLE",
				currency: "BRL",
			});
		});
	});
});
