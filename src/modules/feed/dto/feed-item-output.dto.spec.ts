import { instanceToPlain } from "class-transformer";
import { FeedItemOutputDto } from "./feed-item-output.dto";

function createMockDatabaseJob() {
	return {
		id: "cm3x-1234-abcd",
		title: "Help unload truck",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		paymentType: "FIXED" as const,
		paymentMinAmount: { toNumber: (): number => 150.0 },
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: "SINGLE" as const,
		paymentCurrency: "BRL",
		neighborhood: "Centro",
	};
}

describe("FeedItemOutputDto", () => {
	describe("fromDatabase", () => {
		it("should assign all fields from a database job", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());

			expect(dto.jobId).toBe("cm3x-1234-abcd");
			expect(dto.title).toBe("Help unload truck");
			expect(dto.createdAt).toBe("2026-05-28T10:00:00.000Z");
		});

		it("should construct nested payment DTO", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());

			expect(dto.payment.type).toBe("FIXED");
			expect(dto.payment.minAmount).toBe(150.0);
			expect(dto.payment.maxAmount).toBeUndefined();
			expect(dto.payment.note).toBeUndefined();
			expect(dto.payment.amountPeriod).toBe("SINGLE");
			expect(dto.payment.currency).toBe("BRL");
		});

		it("should construct nested location DTO", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());

			expect(dto.location.neighborhood).toBe("Centro");
		});
	});

	describe("serialization", () => {
		it("should serialize job_id as snake_case", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("job_id", "cm3x-1234-abcd");
			expect(plain).not.toHaveProperty("jobId");
		});

		it("should serialize created_at as snake_case", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("created_at", "2026-05-28T10:00:00.000Z");
		});

		it("should serialize nested payment with snake_case keys", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const payment = plain["payment"] as Record<string, unknown>;

			expect(payment).toHaveProperty("type", "FIXED");
			expect(payment).toHaveProperty("min_amount", 150.0);
			expect(payment).toHaveProperty("amount_period", "SINGLE");
			expect(payment).toHaveProperty("currency", "BRL");
			expect(payment).not.toHaveProperty("max_amount");
			expect(payment).not.toHaveProperty("note");
		});

		it("should serialize nested location with snake_case keys", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).toHaveProperty("neighborhood", "Centro");
		});

		it("should not serialize city in nested location", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("city");
		});

		it("should not serialize state in nested location", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob());
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("state");
		});
	});
});
