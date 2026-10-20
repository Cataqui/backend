import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";
import { PayloadTooLargeError } from "./payload-too-large.error";

describe("PayloadTooLargeError", () => {
	describe("constructor", () => {
		it("should set errorCode to PAYLOAD_TOO_LARGE", () => {
			const error = new PayloadTooLargeError();
			expect(error.errorCode).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
		});

		it("should set 413 HTTP status", () => {
			const error = new PayloadTooLargeError();
			expect(error.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
		});

		it("should set default message when none provided", () => {
			const error = new PayloadTooLargeError();
			expect(error.message).toBe("Request body exceeds the maximum allowed size.");
		});

		it("should set custom message when provided", () => {
			const error = new PayloadTooLargeError("Custom payload too large message");
			expect(error.message).toBe("Custom payload too large message");
		});
	});

	describe("getResponse", () => {
		it("should return object with errorCode and message", () => {
			const error = new PayloadTooLargeError("body too big");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toEqual({ errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: "body too big" });
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new PayloadTooLargeError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of AppError", () => {
			const error = new PayloadTooLargeError();
			expect(error).toBeInstanceOf(AppError);
		});
	});
});
