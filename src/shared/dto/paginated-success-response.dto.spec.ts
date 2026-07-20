import { instanceToPlain } from "class-transformer";
import { PaginatedSuccessResponseDto } from "./paginated-success-response.dto";
import { PaginationOutputDto } from "./pagination-output.dto";

describe("PaginatedSuccessResponseDto", () => {
	describe("constructor", () => {
		it("should assign data, pagination, requestId, timestamp, endpoint", () => {
			const pagination = new PaginationOutputDto(true, "cursor-val");
			const dto = new PaginatedSuccessResponseDto(
				[{ id: 1 }, { id: 2 }],
				pagination,
				"req-123",
				"2026-05-28T10:00:00.000Z",
				"/v1/feed",
			);

			expect(dto.data).toHaveLength(2);
			expect(dto.pagination).toBe(pagination);
			expect(dto.requestId).toBe("req-123");
			expect(dto.timestamp).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.endpoint).toBe("/v1/feed");
		});

		it("should handle empty data array", () => {
			const pagination = new PaginationOutputDto(false, null);
			const dto = new PaginatedSuccessResponseDto([], pagination, "req", "ts", "/test");

			expect(dto.data).toEqual([]);
		});
	});

	describe("serialization", () => {
		it("should serialize to data, pagination, request_id, timestamp, endpoint", () => {
			const pagination = new PaginationOutputDto(true, "cursor-val");
			const dto = new PaginatedSuccessResponseDto(
				[{ id: 1 }],
				pagination,
				"req-abc",
				"2026-05-28T10:00:00.000Z",
				"/v1/feed",
			);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("data");
			expect(plain).toHaveProperty("pagination");
			expect(plain).toHaveProperty("request_id", "req-abc");
			expect(plain).toHaveProperty("timestamp", "2026-05-28T10:00:00.000Z");
			expect(plain).toHaveProperty("endpoint", "/v1/feed");
		});

		it("should serialize pagination with snake_case keys", () => {
			const pagination = new PaginationOutputDto(true, "cursor");
			const dto = new PaginatedSuccessResponseDto([], pagination, "req", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			const paginationPlain = plain["pagination"] as Record<string, unknown>;
			expect(paginationPlain).toHaveProperty("has_more", true);
			expect(paginationPlain).toHaveProperty("next_cursor", "cursor");
		});

		it("should inherit requestId to request_id from parent", () => {
			const pagination = new PaginationOutputDto(false, null);
			const dto = new PaginatedSuccessResponseDto([], pagination, "my-request-id", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("requestId");
			expect(plain).toHaveProperty("request_id", "my-request-id");
		});
	});
});
