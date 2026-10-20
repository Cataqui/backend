import { ErrorCode } from "./error-code.enum";
import { RequestHeaderFieldsTooLargeError } from "./request-header-fields-too-large.error";

describe("RequestHeaderFieldsTooLargeError", () => {
	describe("constructor", () => {
		it("should set errorCode to REQUEST_HEADER_FIELDS_TOO_LARGE", () => {
			const error = new RequestHeaderFieldsTooLargeError();
			expect(error.errorCode).toBe(ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE);
		});

		it("should set 431 HTTP status", () => {
			const error = new RequestHeaderFieldsTooLargeError();
			expect(error.getStatus()).toBe(431);
		});

		it("should set default message when none provided", () => {
			const error = new RequestHeaderFieldsTooLargeError();
			expect(error.message).toBe("Request header fields exceed the maximum allowed size.");
		});

		it("should set custom message when provided", () => {
			const error = new RequestHeaderFieldsTooLargeError("Custom header too large message");
			expect(error.message).toBe("Custom header too large message");
		});
	});

	describe("getResponse", () => {
		it("should return object with errorCode and message", () => {
			const error = new RequestHeaderFieldsTooLargeError("headers too big");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toEqual({
				errorCode: ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
				message: "headers too big",
			});
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new RequestHeaderFieldsTooLargeError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of AppError", () => {
			const error = new RequestHeaderFieldsTooLargeError();
			expect(error).toBeInstanceOf(AppError);
		});
	});
});
import { AppError } from "./app-error";
