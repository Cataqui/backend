import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { CategoryNotFoundError } from "./category-not-found.error";

describe("CategoryNotFoundError", () => {
	describe("constructor", () => {
		it("should set errorCode to CATEGORY_NOT_FOUND", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			expect(error.errorCode).toBe(ErrorCode.JOB_CATEGORY_NOT_FOUND);
		});

		it("should use the provided HTTP status", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
		});

		it("should support not found HTTP status", () => {
			const error = new CategoryNotFoundError(HttpStatus.NOT_FOUND);
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should set the correct message", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			expect(error.message).toBe("The requested category was not found.");
		});
	});

	describe("getResponse", () => {
		it("should return object with CATEGORY_NOT_FOUND error_code", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.JOB_CATEGORY_NOT_FOUND);
		});

		it("should include a message in response", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message");
		});

		it("should include the generic message in the response", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response["message"]).toBe("The requested category was not found.");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new CategoryNotFoundError(HttpStatus.BAD_REQUEST);
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
