import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

class TestNotFoundError extends AppError {
	constructor(message: string) {
		super(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
	}
}

class TestValidationError extends AppError {
	constructor(message: string) {
		super(ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
	}
}

describe("AppError", () => {
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
		it("should return object with errorCode and message", () => {
			const error = new TestNotFoundError("Item not found");
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toEqual({ errorCode: ErrorCode.NOT_FOUND, message: "Item not found" });
		});

		it("should return camelCase keys", () => {
			const error = new TestValidationError("Bad input");
			const response = error.getResponse() as Record<string, unknown>;

			expect(Object.keys(response)).toEqual(["errorCode", "message"]);
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new TestNotFoundError("test");
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of AppError", () => {
			const error = new TestNotFoundError("test");
			expect(error).toBeInstanceOf(AppError);
		});
	});
});
