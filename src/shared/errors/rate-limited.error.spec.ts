import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { RateLimitedError } from "./rate-limited.error";

describe("RateLimitedError", () => {
	describe("constructor", () => {
		it("should set errorCode to RATE_LIMITED", () => {
			const error = new RateLimitedError();
			expect(error.errorCode).toBe(ErrorCode.RATE_LIMITED);
		});

		it("should set 429 HTTP status", () => {
			const error = new RateLimitedError();
			expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
		});

		it("should set default message when none provided", () => {
			const error = new RateLimitedError();
			expect(error.message).toBe("Too many requests. Please try again later.");
		});

		it("should set custom message when provided", () => {
			const error = new RateLimitedError("Custom limit message");
			expect(error.message).toBe("Custom limit message");
		});
	});

	describe("getResponse", () => {
		it("should return object with error_code and message", () => {
			const error = new RateLimitedError("slow down");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.RATE_LIMITED);
			expect(response).toHaveProperty("message", "slow down");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new RateLimitedError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new RateLimitedError();
			expect(error).toBeInstanceOf(Error);
		});
	});
});
