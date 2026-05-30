import { instanceToPlain } from "class-transformer";
import { PaymentOutputDto } from "./payment-output.dto";
import { JobPaymentRecurrence, JobPaymentType } from "../../../../generated/prisma/client.js";

describe("PaymentOutputDto", () => {
	describe("constructor", () => {
		it("should set fields for FIXED payment", () => {
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: 150.0,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentRecurrence: JobPaymentRecurrence.SINGLE,
				paymentCurrency: "BRL",
			});

			expect(dto.type).toBe(JobPaymentType.FIXED);
			expect(dto.minAmount).toBe(150.0);
			expect(dto.maxAmount).toBeUndefined();
			expect(dto.note).toBeUndefined();
			expect(dto.recurrence).toBe(JobPaymentRecurrence.SINGLE);
			expect(dto.currency).toBe("BRL");
		});

		it("should set fields for RANGE payment", () => {
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.RANGE,
				paymentMinAmount: 100.0,
				paymentMaxAmount: 200.0,
				paymentNote: null,
				paymentRecurrence: JobPaymentRecurrence.WEEKLY,
				paymentCurrency: "USD",
			});

			expect(dto.type).toBe(JobPaymentType.RANGE);
			expect(dto.minAmount).toBe(100.0);
			expect(dto.maxAmount).toBe(200.0);
			expect(dto.note).toBeUndefined();
		});

		it("should set fields for OTHER payment", () => {
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.OTHER,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: "Commission-based",
				paymentRecurrence: JobPaymentRecurrence.MONTHLY,
				paymentCurrency: "BRL",
			});

			expect(dto.type).toBe(JobPaymentType.OTHER);
			expect(dto.minAmount).toBeUndefined();
			expect(dto.maxAmount).toBeUndefined();
			expect(dto.note).toBe("Commission-based");
		});

		it("should extract amount from Decimal-like object", () => {
			const decimal = { toNumber: (): number => 250.0 };
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: decimal,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentRecurrence: JobPaymentRecurrence.WEEKLY,
				paymentCurrency: "USD",
			});

			expect(dto.minAmount).toBe(250.0);
		});
	});

	describe("serialization", () => {
		it("should serialize FIXED payment in snake_case", () => {
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: 150.0,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentRecurrence: JobPaymentRecurrence.SINGLE,
				paymentCurrency: "BRL",
			});
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toEqual({
				type: "FIXED",
				min_amount: 150.0,
				recurrence: "SINGLE",
				currency: "BRL",
			});
		});

		it("should omit null fields from serialization", () => {
			const dto = new PaymentOutputDto({
				paymentType: JobPaymentType.FLEXIBLE,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentRecurrence: JobPaymentRecurrence.SINGLE,
				paymentCurrency: "BRL",
			});
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toEqual({
				type: "FLEXIBLE",
				recurrence: "SINGLE",
				currency: "BRL",
			});
			expect(plain).not.toHaveProperty("min_amount");
			expect(plain).not.toHaveProperty("max_amount");
			expect(plain).not.toHaveProperty("note");
		});
	});
});
