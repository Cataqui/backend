import { instanceToPlain } from "class-transformer";
import { PaginationOutputDto } from "./pagination-output.dto";

describe("PaginationOutputDto", () => {
	describe("constructor", () => {
		it("should assign hasMore and nextCursor", () => {
			const dto = new PaginationOutputDto(true, "eyJpZCI6ImRlZjQ1NiJ9");
			expect(dto.hasMore).toBe(true);
			expect(dto.nextCursor).toBe("eyJpZCI6ImRlZjQ1NiJ9");
		});

		it("should accept null nextCursor", () => {
			const dto = new PaginationOutputDto(false, null);
			expect(dto.hasMore).toBe(false);
			expect(dto.nextCursor).toBeNull();
		});
	});

	describe("serialization", () => {
		it("should serialize hasMore to has_more", () => {
			const dto = new PaginationOutputDto(true, null);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("has_more", true);
		});

		it("should serialize nextCursor to next_cursor", () => {
			const dto = new PaginationOutputDto(false, "cursor-value");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("next_cursor", "cursor-value");
		});

		it("should serialize null nextCursor as null", () => {
			const dto = new PaginationOutputDto(true, null);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("next_cursor", null);
		});

		it("should not include camelCase keys", () => {
			const dto = new PaginationOutputDto(true, "cursor");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("hasMore");
			expect(plain).not.toHaveProperty("nextCursor");
		});
	});
});
