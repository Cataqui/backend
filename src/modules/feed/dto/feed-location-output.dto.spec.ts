import { instanceToPlain } from "class-transformer";
import { FeedLocationOutputDto } from "./feed-location-output.dto";

describe("FeedLocationOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from location data", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				latitude: -23.55,
				longitude: -46.63,
			});

			expect(dto).toMatchObject({ neighborhood: "Centro", latitude: -23.55, longitude: -46.63, areaRadius: 2000 });
		});

		it("should convert Decimal-like coordinates to numbers", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				latitude: { toNumber: () => -23.55 },
				longitude: { toNumber: () => -46.63 },
			});

			expect(dto.longitude).toBe(-46.63);
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				latitude: -23.55,
				longitude: -46.63,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({ neighborhood: "Centro", latitude: -23.55, longitude: -46.63, area_radius: 2000 });
		});
	});
});
