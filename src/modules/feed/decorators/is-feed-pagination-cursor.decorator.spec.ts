import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { IsIFeedPaginationCursor } from "./is-feed-pagination-cursor.decorator";
import { CursorUtils } from "../utils/cursor.utils";
import { FeedSort } from "../enums/feed-sort.enum";

const VALID_CURSOR = CursorUtils.encodeCursor({ sort: FeedSort.LATEST, createdAt: "2026-05-28T10:00:00.000Z", jobId: "12345678-1234-1234-1234-1234567890ab" });

class TestDto {
	@IsIFeedPaginationCursor()
	cursor!: string;
}

describe("IsIFeedPaginationCursor", () => {
	it("should pass for a valid cursor", async () => {
		const dto = plainToInstance(TestDto, { cursor: VALID_CURSOR });
		const errors = await validate(dto);

		expect(errors.length).toBe(0);
	});

	it("should fail for a non-string value", async () => {
		const dto = plainToInstance(TestDto, { cursor: 123 });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should fail for string that is not valid base64url", async () => {
		const dto = plainToInstance(TestDto, { cursor: "!!!invalid base64!!!" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should fail for valid base64url but invalid cursor shape", async () => {
		const badCursor = Buffer.from(JSON.stringify({ version: 1, sort: "latest" })).toString("base64url");
		const dto = plainToInstance(TestDto, { cursor: badCursor });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should fail for valid base64url JSON with wrong field types", async () => {
		const badCursor = Buffer.from(JSON.stringify({ version: 1, sort: "latest", createdAt: 123, jobId: "abc" })).toString("base64url");
		const dto = plainToInstance(TestDto, { cursor: badCursor });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should provide a descriptive default error message", async () => {
		const dto = plainToInstance(TestDto, { cursor: "invalid" });
		const errors = await validate(dto);

		expect(errors[0]?.constraints?.["IsIFeedPaginationCursor"]).toBe("The cursor must be a valid encoded feed pagination cursor");
	});
});
