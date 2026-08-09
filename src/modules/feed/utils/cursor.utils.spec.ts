import { InvalidCursorError } from "../errors/invalid-cursor.error";
import type { FeedPaginationCursor } from "../schemas/feed-pagination-cursor.schema";
import { CursorUtils } from "./cursor.utils";

describe("CursorUtils", () => {
	describe("encodeCursor", () => {
		it("should return a base64url-encoded string", () => {
			const result = CursorUtils.encodeCursor({
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-4234-8234-1234567890ab",
			});

			expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
		});
	});

	describe("decodeCursor", () => {
		it("should decode a valid cursor", () => {
			const encoded = CursorUtils.encodeCursor({
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-4234-8234-1234567890ab",
			});

			const decoded = CursorUtils.decodeCursor({ cursor: encoded });

			expect(decoded).toMatchObject({
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-4234-8234-1234567890ab",
			});
		});

		it("should throw on malformed JSON", () => {
			const notJson = Buffer.from("this is not json").toString("base64url");
			expect(() => CursorUtils.decodeCursor({ cursor: notJson })).toThrow(InvalidCursorError);
		});

		it("should throw on unsupported version", () => {
			const payload = Buffer.from(
				JSON.stringify({
					version: 99,
					createdAt: "2026-05-28T10:00:00.000Z",
					jobId: "12345678-1234-4234-8234-1234567890ab",
				}),
			).toString("base64url");
			expect(() => CursorUtils.decodeCursor({ cursor: payload })).toThrow(
				"Cursor version '99' is not supported. Please use 1",
			);
		});

		it("should throw on missing fields", () => {
			const payload = Buffer.from(JSON.stringify({ version: 1 })).toString("base64url");
			expect(() => CursorUtils.decodeCursor({ cursor: payload })).toThrow(
				"Cursor is missing required fields or has invalid types.",
			);
		});

		it("should roundtrip successfully", () => {
			const original: Omit<FeedPaginationCursor, "version"> = {
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-4234-8234-1234567890ab",
			};

			const encoded = CursorUtils.encodeCursor(original);
			const decoded = CursorUtils.decodeCursor({ cursor: encoded });

			expect(decoded).toEqual({ ...original, version: 1 });
		});
	});
});
