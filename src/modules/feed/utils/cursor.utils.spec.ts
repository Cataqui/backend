import { FeedSort } from "../enums/feed-sort.enum";
import { InvalidCursorError } from "../errors/invalid-cursor.error";
import type { IFeedPaginationCursor } from "../interfaces/feed-pagination-cursor.interface";
import { CursorUtils } from "./cursor.utils";

describe("CursorUtils", () => {
	describe("encodeCursor", () => {
		it("should return a base64url-encoded string", () => {
			const result = CursorUtils.encodeCursor({
				sort: FeedSort.LATEST,
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-1234-1234-1234567890ab",
			});

			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("decodeCursor", () => {
		it("should decode a valid cursor", () => {
			const encoded = CursorUtils.encodeCursor({
				sort: FeedSort.LATEST,
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-1234-1234-1234567890ab",
			});

			const decoded = CursorUtils.decodeCursor(encoded, FeedSort.LATEST);

			expect(decoded.createdAt).toBe("2026-05-28T10:00:00.000Z");
			expect(decoded.jobId).toBe("12345678-1234-1234-1234-1234567890ab");
		});

		it("should throw on malformed JSON", () => {
			const notJson = Buffer.from("this is not json").toString("base64url");
			expect(() => CursorUtils.decodeCursor(notJson, FeedSort.LATEST)).toThrow(InvalidCursorError);
		});

		it("should throw on unsupported version", () => {
			const payload = Buffer.from(
				JSON.stringify({
					version: 99,
					sort: "LATEST",
					createdAt: "2026-05-28T10:00:00.000Z",
					jobId: "12345678-1234-1234-1234-1234567890ab",
				}),
			).toString("base64url");
			expect(() => CursorUtils.decodeCursor(payload, FeedSort.LATEST)).toThrow(
				"Cursor version '99' is not supported. Please use 1",
			);
		});

		it("should throw on sort mismatch", () => {
			const encoded = CursorUtils.encodeCursor({
				sort: FeedSort.LATEST,
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-1234-1234-1234567890ab",
			});

			expect(() => CursorUtils.decodeCursor(encoded, "EXPIRING" as FeedSort)).toThrow("does not match requested sort");
		});

		it("should throw on missing fields", () => {
			const payload = Buffer.from(JSON.stringify({ version: 1, sort: "LATEST" })).toString("base64url");
			expect(() => CursorUtils.decodeCursor(payload, FeedSort.LATEST)).toThrow(
				"Cursor is missing required fields or has invalid types.",
			);
		});

		it("should roundtrip successfully", () => {
			const original: Omit<IFeedPaginationCursor, "version"> = {
				sort: FeedSort.LATEST,
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-1234-1234-1234567890ab",
			};

			const encoded = CursorUtils.encodeCursor(original);
			const decoded = CursorUtils.decodeCursor(encoded, FeedSort.LATEST);

			expect(decoded.createdAt).toBe(original.createdAt);
			expect(decoded.jobId).toBe(original.jobId);
			expect(decoded.version).toBe(1);
			expect(decoded.sort).toBe(original.sort);
		});
	});
});
