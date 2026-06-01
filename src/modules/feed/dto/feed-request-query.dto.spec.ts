import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { FeedRequestQueryDto } from "./feed-request-query.dto";
import { CursorUtils } from "../utils/cursor.utils";
import { FeedSort } from "../enums/feed-sort.enum";

const VALID_CURSOR = CursorUtils.encodeCursor({ sort: FeedSort.LATEST, createdAt: "2026-05-28T10:00:00.000Z", jobId: "12345678-1234-1234-1234-1234567890ab" });

describe("FeedRequestQueryDto", () => {
	describe("validation", () => {
		it("should pass with valid cursor", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: VALID_CURSOR });
			const errors = await validate(dto);

			expect(errors.length).toBe(0);
		});

		it("should fail when cursor is not valid base64", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: "not-base64!!!" });
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when cursor contains spaces", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: "invalid cursor data" });
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when cursor is valid base64 but invalid cursor shape", async () => {
			const badCursor = Buffer.from(JSON.stringify({ version: 1, sort: "latest" })).toString("base64url");
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: badCursor });
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should pass with valid optional sort", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { sort: "latest" });
			const errors = await validate(dto);

			expect(errors.length).toBe(0);
		});

		it("should fail when sort is not a valid FeedSort", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { sort: "invalid" });
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should pass with no optional fields", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, {});
			const errors = await validate(dto);

			expect(errors.length).toBe(0);
		});

		it("should pass with all valid fields", async () => {
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: VALID_CURSOR, sort: "latest" });
			const errors = await validate(dto);

			expect(errors.length).toBe(0);
		});

		it("should fail when cursor exceeds 512 characters", async () => {
			const longCursor = "a".repeat(513);
			const dto = plainToInstance(FeedRequestQueryDto, { cursor: longCursor });
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
