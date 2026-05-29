import { instanceToPlain } from "class-transformer";
import { PaginatedResponseDto } from "./paginated-response.dto";
import { PaginationOutputDto } from "./pagination-output.dto";

describe("PaginatedResponseDto", () => {
	describe("constructor", () => {
		it("should assign data and pagination", () => {
			const pagination = new PaginationOutputDto(false, null);
			const dto = new PaginatedResponseDto([{ id: 1 }, { id: 2 }], pagination);

			expect(dto.data).toHaveLength(2);
			expect(dto.pagination).toBe(pagination);
		});

		it("should handle empty data array", () => {
			const pagination = new PaginationOutputDto(false, null);
			const dto = new PaginatedResponseDto([], pagination);

			expect(dto.data).toEqual([]);
		});
	});

	describe("serialization", () => {
		it("should serialize to data and pagination", () => {
			const pagination = new PaginationOutputDto(true, "next-cursor");
			const dto = new PaginatedResponseDto([{ id: 1 }, { id: 2 }], pagination);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("data");
			expect(plain).toHaveProperty("pagination");
			expect(Array.isArray(plain["data"])).toBe(true);
			expect(plain["data"] as Array<unknown>).toHaveLength(2);
		});

		it("should serialize pagination with snake_case keys", () => {
			const pagination = new PaginationOutputDto(true, "cursor-val");
			const dto = new PaginatedResponseDto([], pagination);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			const paginationPlain = plain["pagination"] as Record<string, unknown>;
			expect(paginationPlain).toHaveProperty("has_more", true);
			expect(paginationPlain).toHaveProperty("next_cursor", "cursor-val");
		});
	});
});
