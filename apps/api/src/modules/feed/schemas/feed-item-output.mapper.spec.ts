import { toFeedItemOutput } from "./feed-item-output.mapper";
import { FeedItemOutputSchema } from "./feed-item-output.schema";

function createMockDatabaseJob() {
	return {
		id: "cm3x-1234-abcd",
		title: "Help unload truck",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		descriptionSummary: "",
		paymentType: "FIXED" as const,
		paymentMinAmount: { toNumber: (): number => 150.0 },
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: "SINGLE" as const,
		paymentCurrency: "BRL",
		fuzzyLatitude: { toNumber: () => -23.55 },
		fuzzyLongitude: { toNumber: () => -46.63 },
	};
}

describe("toFeedItemOutput", () => {
	describe("database output", () => {
		it("should assign all fields from a database job", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });

			expect({ jobId: dto.jobId, title: dto.title, createdAt: dto.createdAt }).toEqual({
				jobId: "cm3x-1234-abcd",
				title: "Help unload truck",
				createdAt: "2026-05-28T10:00:00.000Z",
			});
		});

		it("should construct the nested payment output", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });

			expect(dto.payment).toEqual({
				type: "FIXED",
				minAmount: 150,
				maxAmount: null,
				note: null,
				amountPeriod: "SINGLE",
				currency: "BRL",
			});
		});

		it("should construct the nested location output", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });

			expect(dto.location).toMatchObject({
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
			});
		});
	});

	describe("serialization", () => {
		it("should serialize jobId as camelCase", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });
			const plain = FeedItemOutputSchema.parse(dto);

			expect(plain.jobId).toBe("cm3x-1234-abcd");
		});

		it("should serialize createdAt as camelCase", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });
			const plain = FeedItemOutputSchema.parse(dto);

			expect(plain.createdAt).toBe("2026-05-28T10:00:00.000Z");
		});

		it("should serialize nested payment with camelCase keys", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });
			const payment = FeedItemOutputSchema.parse(dto).payment;

			expect(payment).toEqual({
				type: "FIXED",
				minAmount: 150,
				maxAmount: null,
				note: null,
				amountPeriod: "SINGLE",
				currency: "BRL",
			});
		});

		it("should serialize nested location with camelCase keys", () => {
			const dto = toFeedItemOutput({ job: createMockDatabaseJob() });
			const location = FeedItemOutputSchema.parse(dto).location;

			expect(location).toEqual({
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
			});
		});

		it.each(["street", "neighborhood", "city", "state", "country"])(
			"should not serialize %s in nested location",
			(field) => {
				const dto = toFeedItemOutput({ job: createMockDatabaseJob() });
				const location = FeedItemOutputSchema.parse(dto).location;

				expect(location).not.toHaveProperty(field);
			},
		);
	});
});
