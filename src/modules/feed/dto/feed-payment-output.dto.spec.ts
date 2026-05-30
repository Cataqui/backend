import { instanceToPlain } from "class-transformer";
import { FeedPaymentOutputDto } from "./feed-payment-output.dto";

function createMockPaymentData() {
	return {
		paymentAmount: { toNumber: (): number => 150.0 },
		paymentRecurrence: "SINGLE" as const,
		paymentCurrency: "BRL",
	};
}

describe("FeedPaymentOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from payment data", () => {
			const dto = new FeedPaymentOutputDto(createMockPaymentData());

			expect(dto.amount).toBe(150.0);
			expect(dto.recurrence).toBe("SINGLE");
			expect(dto.currency).toBe("BRL");
		});

		it("should handle number directly", () => {
			const dto = new FeedPaymentOutputDto({
				paymentAmount: 200.0,
				paymentRecurrence: "DAILY" as const,
				paymentCurrency: "USD",
			});

			expect(dto.amount).toBe(200.0);
			expect(dto.currency).toBe("USD");
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys", () => {
			const dto = new FeedPaymentOutputDto(createMockPaymentData());
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("amount", 150.0);
			expect(plain).toHaveProperty("recurrence", "SINGLE");
			expect(plain).toHaveProperty("currency", "BRL");
		});
	});
});
