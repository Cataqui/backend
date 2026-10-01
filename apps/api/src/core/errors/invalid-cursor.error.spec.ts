import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { InvalidCursorError } from "./invalid-cursor.error";

describe("InvalidCursorError", () => {
	it("should have INVALID_CURSOR error code", () => {
		const error = new InvalidCursorError();

		expect(error.errorCode).toBe(ErrorCode.INVALID_CURSOR);
	});

	it("should have BAD_REQUEST status", () => {
		const error = new InvalidCursorError();

		expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
	});

	it("should use default message when none provided", () => {
		const error = new InvalidCursorError();

		expect(error.message).toBe("The provided cursor is invalid or malformed.");
	});

	it("should use custom message when provided", () => {
		const error = new InvalidCursorError("Something went wrong.");

		expect(error.message).toBe("Something went wrong.");
	});
});
