import { instanceToPlain } from "class-transformer";
import { JobCategoryOutputDto } from "./job-category-output.dto";

describe("JobCategoryOutputDto", () => {
	describe("constructor", () => {
		it("should set all category fields", () => {
			const dto = new JobCategoryOutputDto({ categoryId: "cm3x-1234", name: "Moving Help", slug: "moving-help" });

			expect(dto.categoryId).toBe("cm3x-1234");
			expect(dto.name).toBe("Moving Help");
			expect(dto.slug).toBe("moving-help");
		});
	});

	describe("serialization", () => {
		it("should serialize category_id as snake_case", () => {
			const dto = new JobCategoryOutputDto({ categoryId: "cm3x-1234", name: "Moving Help", slug: "moving-help" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("category_id", "cm3x-1234");
			expect(plain).not.toHaveProperty("categoryId");
		});

		it("should serialize all fields", () => {
			const dto = new JobCategoryOutputDto({ categoryId: "cm3x-1234", name: "Moving Help", slug: "moving-help" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				category_id: "cm3x-1234",
				name: "Moving Help",
				slug: "moving-help",
			});
		});
	});
});
