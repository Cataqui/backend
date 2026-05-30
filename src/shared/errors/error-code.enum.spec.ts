import { ErrorCode } from "./error-code.enum";

describe("ErrorCode", () => {
	it("should have all expected values", () => {
		const expectedValues = [
			"VALIDATION_ERROR",
			"NOT_FOUND",
			"INTERNAL_ERROR",
			"RATE_LIMITED",
			"ROUTE_NOT_FOUND",
			"INVALID_REQUEST",
			"POST_NOT_FOUND",
			"POST_ALREADY_REPORTED",
			"INVALID_CURSOR",
			"JOB_CATEGORY_NOT_FOUND",
			"JOB_NOT_FOUND",
			"INVALID_JOB_TYPE_RECURRENCE",
			"INVALID_LOCALE",
		] as const;

		for (const value of expectedValues) {
			expect(ErrorCode[value]).toBe(value);
		}
	});

	it("should have string values matching their keys", () => {
		const keys = Object.keys(ErrorCode) as (keyof typeof ErrorCode)[];

		for (const key of keys) {
			expect(ErrorCode[key]).toBe(key);
		}
	});

	it("should have exactly 13 members", () => {
		expect(Object.keys(ErrorCode)).toHaveLength(13);
	});
});
