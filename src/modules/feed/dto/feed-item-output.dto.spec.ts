import { instanceToPlain } from "class-transformer";
import { FeedItemOutputDto } from "./feed-item-output.dto";
import { MapConfigOutputDto } from "../../map/dto/map-config-output.dto";

const mockMapConfig = new MapConfigOutputDto({
	queryParams: "v=1&sig=abc&exp=1717891200",
	expiresAt: "2026-06-10T12:00:00.000Z",
	mapVersion: "br",
	tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
	glyphUrlTemplate: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
});

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
		neighborhood: "Centro",
		fuzzyLatitude: { toNumber: () => -23.55 },
		fuzzyLongitude: { toNumber: () => -46.63 },
	};
}

describe("FeedItemOutputDto", () => {
	describe("fromDatabase", () => {
		it("should assign all fields from a database job", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);

			expect(dto.jobId).toBe("cm3x-1234-abcd");
			expect(dto.title).toBe("Help unload truck");
			expect(dto.createdAt).toBe("2026-05-28T10:00:00.000Z");
		});

		it("should construct nested payment DTO", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);

			expect(dto.payment.type).toBe("FIXED");
			expect(dto.payment.minAmount).toBe(150.0);
			expect(dto.payment.maxAmount).toBeUndefined();
			expect(dto.payment.note).toBeUndefined();
			expect(dto.payment.amountPeriod).toBe("SINGLE");
			expect(dto.payment.currency).toBe("BRL");
		});

		it("should construct nested location DTO", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);

			expect(dto.location).toMatchObject({ neighborhood: "Centro", latitude: -23.55, longitude: -46.63, areaRadius: 2000 });
		});
	});

	describe("serialization", () => {
		it("should serialize job_id as snake_case", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("job_id", "cm3x-1234-abcd");
			expect(plain).not.toHaveProperty("jobId");
		});

		it("should serialize created_at as snake_case", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("created_at", "2026-05-28T10:00:00.000Z");
		});

		it("should serialize nested payment with snake_case keys", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
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
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).toEqual({
				neighborhood: "Centro",
				latitude: -23.55,
				longitude: -46.63,
				area_radius: 2000,
				map_config: {
					query_params: "v=1&sig=abc&exp=1717891200",
					expires_at: "2026-06-10T12:00:00.000Z",
					map_version: "br",
					tiles_url_template: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
					glyph_url_template: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
					tile_min_zoom: 1,
					tile_max_zoom: 14,
				},
			});
		});

		it("should not serialize city in nested location", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("city");
		});

		it("should not serialize state in nested location", () => {
			const dto = FeedItemOutputDto.fromDatabase(createMockDatabaseJob(), mockMapConfig);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("state");
		});
	});
});
