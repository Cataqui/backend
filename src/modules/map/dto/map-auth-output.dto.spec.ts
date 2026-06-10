import { instanceToPlain } from "class-transformer";
import { MapAuthOutputDto } from "./map-auth-output.dto";

function createMapAuth(): MapAuthOutputDto {
	return new MapAuthOutputDto({
		queryParams: "v=1&sig=abc123&exp=1717891200",
		expiresAt: "2026-06-10T12:00:00.000Z",
		mapVersion: "br",
		tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
	});
}

describe("MapAuthOutputDto", () => {
	describe("constructor", () => {
		it("should assign queryParams", () => {
			const dto = createMapAuth();

			expect(dto.queryParams).toBe("v=1&sig=abc123&exp=1717891200");
		});

		it("should assign expiresAt", () => {
			const dto = createMapAuth();

			expect(dto.expiresAt).toBe("2026-06-10T12:00:00.000Z");
		});

		it("should assign mapFileName", () => {
			const dto = createMapAuth();

			expect(dto.mapVersion).toBe("br");
		});

		it("should assign tilesUrlTemplate", () => {
			const dto = createMapAuth();

			expect(dto.tilesUrlTemplate).toBe("https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt");
		});
	});

	describe("serialization", () => {
		it("should serialize query_params as snake_case", () => {
			const dto = createMapAuth();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("query_params", "v=1&sig=abc123&exp=1717891200");
			expect(plain).not.toHaveProperty("queryParams");
		});

		it("should serialize expires_at as snake_case", () => {
			const dto = createMapAuth();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("expires_at", "2026-06-10T12:00:00.000Z");
			expect(plain).not.toHaveProperty("expiresAt");
		});

		it("should serialize map_version as map_version", () => {
			const dto = createMapAuth();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("map_version", "br");
			expect(plain).not.toHaveProperty("mapFileName");
		});

		it("should serialize tiles_url_template as snake_case", () => {
			const dto = createMapAuth();
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("tiles_url_template", "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt");
			expect(plain).not.toHaveProperty("tilesUrlTemplate");
		});
	});
});
