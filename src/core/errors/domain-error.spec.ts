import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

class TestNotFoundError extends DomainError {
	constructor(message: string) {
		super(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
	}
}

class TestValidationError extends DomainError {
	constructor(message: string) {
		super(ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
	}
}

describe("DomainError", () => {
	describe("constructor", () => {
		it("should set errorCode property", () => {
			const error = new TestNotFoundError("Item not found");
			expect(error.errorCode).toBe(ErrorCode.NOT_FOUND);
		});

		it("should set the correct HTTP status", () => {
			const error = new TestNotFoundError("Item not found");
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should set the message", () => {
			const error = new TestNotFoundError("Item not found");
			expect(error.message).toBe("Item not found");
		});
	});

	describe("getResponse", () => {
		it("should return object with error_code and message", () => {
			const error = new TestNotFoundError("Item not found");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.NOT_FOUND);
			expect(response).toHaveProperty("message", "Item not found");
		});

		it("should return snake_case keys, not camelCase", () => {
			const error = new TestValidationError("Bad input");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code");
			expect(response).not.toHaveProperty("errorCode");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new TestNotFoundError("test");
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new TestNotFoundError("test");
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
