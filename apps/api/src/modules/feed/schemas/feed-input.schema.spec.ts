import { encodeFeedPaginationCursor } from "../utils/cursor.utils";
import { FeedInputSchema } from "./feed-input.schema";

const VALID_CURSOR = encodeFeedPaginationCursor({
	createdAt: "2026-05-28T10:00:00.000Z",
	jobId: "12345678-1234-4234-8234-1234567890ab",
});

describe("FeedInputSchema", () => {
	describe("validation", () => {
		it("should pass with valid cursor", () => {
			expect(FeedInputSchema.safeParse({ cursor: VALID_CURSOR }).success).toBe(true);
		});

		it("should fail when cursor is not valid base64", () => {
			expect(FeedInputSchema.safeParse({ cursor: "not-base64!!!" }).success).toBe(false);
		});

		it("should fail when cursor contains spaces", () => {
			expect(FeedInputSchema.safeParse({ cursor: "invalid cursor data" }).success).toBe(false);
		});

		it("should accept an opaque Base64 URL cursor and leave its domain contents to the feed service", () => {
			const badCursor = Buffer.from(JSON.stringify({ version: 1, sort: "LATEST" })).toString("base64url");

			expect(FeedInputSchema.safeParse({ cursor: badCursor }).success).toBe(true);
		});

		it("should reject the removed sort input", () => {
			expect(FeedInputSchema.safeParse({ sort: "LATEST" }).success).toBe(false);
		});

		it("should pass with no optional fields", () => {
			expect(FeedInputSchema.safeParse({}).success).toBe(true);
		});

		it("should fail when cursor exceeds 512 characters", () => {
			const longCursor = "a".repeat(513);

			expect(FeedInputSchema.safeParse({ cursor: longCursor }).success).toBe(false);
		});
	});
});
