import { PaginatedResult } from "./paginated-result";

describe("PaginatedResult", () => {
	it("should preserve page data and pagination metadata", () => {
		const result = PaginatedResult.create({
			data: [{ id: 1 }, { id: 2 }],
			pagination: { hasMore: true, nextCursor: "cursor" },
		});

		expect(result).toMatchObject({
			data: [{ id: 1 }, { id: 2 }],
			pagination: { hasMore: true, nextCursor: "cursor" },
		});
	});

	it("should identify a paginated result", () => {
		const result = PaginatedResult.create({ data: [], pagination: { hasMore: false, nextCursor: null } });

		expect(PaginatedResult.is(result)).toBe(true);
	});

	it("should reject ordinary response objects", () => {
		expect(PaginatedResult.is({ data: [], pagination: { hasMore: false, nextCursor: null } })).toBe(false);
	});
});
