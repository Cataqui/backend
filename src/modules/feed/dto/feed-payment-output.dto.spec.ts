import { instanceToPlain } from "class-transformer";
import { FeedPaymentOutputDto } from "./feed-payment-output.dto";
import { JobPaymentType } from "../../../../generated/prisma/client.js";

function createMockPaymentData() {
	return {
		paymentType: JobPaymentType.FIXED,
		paymentMinAmount: { toNumber: (): number => 150.0 },
		paymentMaxAmount: null,
		paymentNote: null,
		paymentRecurrence: "SINGLE" as const,
		paymentCurrency: "BRL",
	};
}

describe("FeedPaymentOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from payment data", () => {
			const dto = new FeedPaymentOutputDto(createMockPaymentData());

			expect(dto.type).toBe(JobPaymentType.FIXED);
			expect(dto.minAmount).toBe(150.0);
			expect(dto.maxAmount).toBeUndefined();
			expect(dto.note).toBeUndefined();
			expect(dto.recurrence).toBe("SINGLE");
			expect(dto.currency).toBe("BRL");
		});

		it("should handle number directly", () => {
			const dto = new FeedPaymentOutputDto({
				paymentType: JobPaymentType.RANGE,
				paymentMinAmount: 100.0,
				paymentMaxAmount: 200.0,
				paymentNote: null,
				paymentRecurrence: "DAILY" as const,
				paymentCurrency: "USD",
			});

			expect(dto.minAmount).toBe(100.0);
			expect(dto.maxAmount).toBe(200.0);
			expect(dto.currency).toBe("USD");
		});

		it("should handle OTHER with note", () => {
			const dto = new FeedPaymentOutputDto({
				paymentType: JobPaymentType.OTHER,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: "Profit share",
				paymentRecurrence: "MONTHLY" as const,
				paymentCurrency: "BRL",
			});

			expect(dto.type).toBe(JobPaymentType.OTHER);
			expect(dto.minAmount).toBeUndefined();
			expect(dto.maxAmount).toBeUndefined();
			expect(dto.note).toBe("Profit share");
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys and omit nulls", () => {
			const dto = new FeedPaymentOutputDto(createMockPaymentData());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toEqual({
				type: "FIXED",
				min_amount: 150.0,
				recurrence: "SINGLE",
				currency: "BRL",
			});
		});

		it("should not include undefined fields", () => {
			const dto = new FeedPaymentOutputDto({
				paymentType: JobPaymentType.FLEXIBLE,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentRecurrence: "SINGLE" as const,
				paymentCurrency: "BRL",
			});
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("min_amount");
			expect(plain).not.toHaveProperty("max_amount");
			expect(plain).not.toHaveProperty("note");
		});
	});
});
