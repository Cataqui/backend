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
			"JOB_NOT_FOUND",
			"JOB_DATA_DERIVATION_UNAVAILABLE",
			"JOB_IDEMPOTENCY_CONFLICT",
			"INVALID_LOCALE",
			"UNSUPPORTED_MEDIA_TYPE",
			"PAYLOAD_TOO_LARGE",
			"URI_TOO_LONG",
			"REQUEST_HEADER_FIELDS_TOO_LARGE",
			"ACCESS_TOKEN_REQUIRED",
			"PROFILE_REQUIRED",
			"PROFILE_CREATION_CONFLICT",
			"PROFILE_NOT_FOUND",
			"INVITE_UNAVAILABLE",
			"ACCOUNT_INVITE_ALREADY_SET",
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

	it("should expose every supported error code", () => {
		expect(Object.keys(ErrorCode)).toHaveLength(25);
	});
});
