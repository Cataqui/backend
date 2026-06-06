import { instanceToPlain } from "class-transformer";
import { FeedLocationOutputDto } from "./feed-location-output.dto";

describe("FeedLocationOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields from location data", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
			});

			expect(dto.neighborhood).toBe("Centro");
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys", () => {
			const dto = new FeedLocationOutputDto({
				neighborhood: "Centro",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("neighborhood", "Centro");
		});
	});
});
