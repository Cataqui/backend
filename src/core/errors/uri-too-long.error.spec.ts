import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { UriTooLongError } from "./uri-too-long.error";

describe("UriTooLongError", () => {
	describe("constructor", () => {
		it("should set errorCode to URI_TOO_LONG", () => {
			const error = new UriTooLongError();
			expect(error.errorCode).toBe(ErrorCode.URI_TOO_LONG);
		});

		it("should set 414 HTTP status", () => {
			const error = new UriTooLongError();
			expect(error.getStatus()).toBe(HttpStatus.URI_TOO_LONG);
		});

		it("should set default message when none provided", () => {
			const error = new UriTooLongError();
			expect(error.message).toBe("Request URL exceeds the maximum allowed length.");
		});

		it("should set custom message when provided", () => {
			const error = new UriTooLongError("Custom URI too long message");
			expect(error.message).toBe("Custom URI too long message");
		});
	});

	describe("getResponse", () => {
		it("should return object with error_code and message", () => {
			const error = new UriTooLongError("url too long");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.URI_TOO_LONG);
			expect(response).toHaveProperty("message", "url too long");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new UriTooLongError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new UriTooLongError();
			expect(error).toBeInstanceOf(Error);
		});
	});
});
