import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { InvalidLocaleException } from "./invalid-locale.exception";

describe("InvalidLocaleException", () => {
	describe("constructor", () => {
		it("should set errorCode to INVALID_LOCALE", () => {
			const error = new InvalidLocaleException("!!!bad");
			expect(error.errorCode).toBe(ErrorCode.INVALID_LOCALE);
		});

		it("should set HTTP status to BAD_REQUEST", () => {
			const error = new InvalidLocaleException("!!!bad");
			expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
		});

		it("should include the invalid value in the message", () => {
			const error = new InvalidLocaleException("!!!bad");
			expect(error.message).toContain("!!!bad");
		});

		it("should mention BCP 47 in the message", () => {
			const error = new InvalidLocaleException("1234");
			expect(error.message).toContain("BCP 47");
		});
	});

	describe("getResponse", () => {
		it("should return error_code and message", () => {
			const error = new InvalidLocaleException("en_US");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.INVALID_LOCALE);
			expect(response).toHaveProperty("message");
		});
	});
});
