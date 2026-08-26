import { PaginationOutputSchema } from "./pagination-output.schema";

describe("PaginationOutputSchema", () => {
	it("should serialize camelCase pagination fields", () => {
		expect(PaginationOutputSchema.parse({ hasMore: true, nextCursor: "cursor" })).toEqual({
			hasMore: true,
			nextCursor: "cursor",
		});
	});

	it("should reject undeclared pagination fields", () => {
		expect(() => PaginationOutputSchema.parse({ hasMore: true, nextCursor: null, page: 2 })).toThrow();
	});
});
