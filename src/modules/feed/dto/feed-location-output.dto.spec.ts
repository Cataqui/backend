import { instanceToPlain } from "class-transformer";
import { FeedLocationOutputDto } from "./feed-location-output.dto";

describe("FeedLocationOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from location data", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
			});

			expect(dto.neighborhood).toBe("Centro");
			expect(dto.city).toBe("São Paulo");
			expect(dto.state).toBe("SP");
		});

		it("should handle nullable neighborhood", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: null,
				city: "São Paulo",
				state: "SP",
			});

			expect(dto.neighborhood).toBeNull();
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("neighborhood", "Centro");
			expect(plain).toHaveProperty("city", "São Paulo");
			expect(plain).toHaveProperty("state", "SP");
		});

		it("should serialize nullable neighborhood as null", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: null,
				city: "São Paulo",
				state: "SP",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("neighborhood", null);
		});
	});
});
