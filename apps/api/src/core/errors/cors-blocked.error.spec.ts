import { HttpStatus } from "@nestjs/common";
import { CorsBlockedError } from "./cors-blocked.error";
import { ErrorCode } from "./error-code.enum";

describe("CorsBlockedError", () => {
	it("should have the correct error code", () => {
		const error = new CorsBlockedError();

		expect(error.errorCode).toBe(ErrorCode.CORS_BLOCKED);
	});

	it("should have the correct HTTP status", () => {
		const error = new CorsBlockedError();

		expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
	});

	it("should have a default message", () => {
		const error = new CorsBlockedError();

		expect(error.message).toBe("The origin of this request is blocked.");
	});

	it("should accept a custom message", () => {
		const error = new CorsBlockedError("Custom message");

		expect(error.message).toBe("Custom message");
	});
});
