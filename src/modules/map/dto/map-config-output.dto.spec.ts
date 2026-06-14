import { instanceToPlain } from "class-transformer";
import { MapConfigOutputDto } from "./map-config-output.dto";

function createMapConfig(): MapConfigOutputDto {
	return new MapConfigOutputDto({
		queryParams: "v=1&sig=abc123&exp=1717891200",
		expiresAt: "2026-06-10T12:00:00.000Z",
		mapVersion: "br",
		tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
		glyphUrlTemplate: "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf",
	});
}

describe("MapConfigOutputDto", () => {
	describe("constructor", () => {
		it("should assign queryParams", () => {
			const dto = createMapConfig();

			expect(dto.queryParams).toBe("v=1&sig=abc123&exp=1717891200");
		});

		it("should assign expiresAt", () => {
			const dto = createMapConfig();

			expect(dto.expiresAt).toBe("2026-06-10T12:00:00.000Z");
		});

		it("should assign mapFileName", () => {
			const dto = createMapConfig();

			expect(dto.mapVersion).toBe("br");
		});

		it("should assign tilesUrlTemplate", () => {
			const dto = createMapConfig();

			expect(dto.tilesUrlTemplate).toBe("https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt");
		});

		it("should assign glyphUrlTemplate", () => {
			const dto = createMapConfig();

			expect(dto.glyphUrlTemplate).toBe("https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf");
		});

		it("should set tileMinZoom to 1", () => {
			const dto = createMapConfig();

			expect(dto.tileMinZoom).toBe(1);
		});

		it("should set tileMaxZoom to 14", () => {
			const dto = createMapConfig();

			expect(dto.tileMaxZoom).toBe(14);
		});
	});

	describe("serialization", () => {
		it("should serialize query_params as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("query_params", "v=1&sig=abc123&exp=1717891200");
			expect(plain).not.toHaveProperty("queryParams");
		});

		it("should serialize expires_at as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("expires_at", "2026-06-10T12:00:00.000Z");
			expect(plain).not.toHaveProperty("expiresAt");
		});

		it("should serialize map_version as map_version", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("map_version", "br");
			expect(plain).not.toHaveProperty("mapFileName");
		});

		it("should serialize tiles_url_template as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("tiles_url_template", "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt");
			expect(plain).not.toHaveProperty("tilesUrlTemplate");
		});

		it("should serialize glyph_url_template as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("glyph_url_template", "https://tiles.cataqui.com/glyphs/{fontstack}/{range}.pbf");
			expect(plain).not.toHaveProperty("glyphUrlTemplate");
		});

		it("should serialize tile_min_zoom as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("tile_min_zoom", 1);
			expect(plain).not.toHaveProperty("tileMinZoom");
		});

		it("should serialize tile_max_zoom as snake_case", () => {
			const dto = createMapConfig();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("tile_max_zoom", 14);
			expect(plain).not.toHaveProperty("tileMaxZoom");
		});
	});
});
