import { instanceToPlain } from "class-transformer";
import { FeedLocationOutputDto } from "./feed-location-output.dto";
import { MapAuthOutputDto } from "../../map/dto/map-auth-output.dto";

const mockMapAuth = new MapAuthOutputDto({
	queryParams: "v=1&sig=abc&exp=1717891200",
	expiresAt: "2026-06-10T12:00:00.000Z",
	mapVersion: "br",
	tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
	glyphUrlTemplate: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
});

describe("FeedLocationOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from location data", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				latitude: -23.55,
				longitude: -46.63,
				mapAuth: mockMapAuth,
			});

			expect(dto).toMatchObject({ neighborhood: "Centro", latitude: -23.55, longitude: -46.63, areaRadius: 2000 });
		});

		it("should convert Decimal-like coordinates to numbers", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				latitude: { toNumber: () => -23.55 },
				longitude: { toNumber: () => -46.63 },
				mapAuth: mockMapAuth,
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
				mapAuth: mockMapAuth,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				neighborhood: "Centro",
				latitude: -23.55,
				longitude: -46.63,
				area_radius: 2000,
				map_auth: {
					query_params: "v=1&sig=abc&exp=1717891200",
					expires_at: "2026-06-10T12:00:00.000Z",
					map_version: "br",
					tiles_url_template: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
					glyph_url_template: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
				},
			});
		});
	});
});
