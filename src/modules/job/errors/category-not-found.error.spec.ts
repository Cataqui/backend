import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../shared/errors/error-code.enum";
import { DomainError } from "../../../shared/errors/domain-error";
import { CategoryNotFoundError } from "./category-not-found.error";

describe("CategoryNotFoundError", () => {
	const categoryId = "cm3x-1234-abcd";

	describe("constructor", () => {
		it("should set errorCode to CATEGORY_NOT_FOUND", () => {
			const error = new CategoryNotFoundError(categoryId);
			expect(error.errorCode).toBe(ErrorCode.JOB_CATEGORY_NOT_FOUND);
		});

		it("should set HTTP status to 404", () => {
			const error = new CategoryNotFoundError(categoryId);
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should include the category ID in the message", () => {
			const error = new CategoryNotFoundError(categoryId);
			expect(error.message).toContain(categoryId);
		});
	});

	describe("getResponse", () => {
		it("should return object with CATEGORY_NOT_FOUND error_code", () => {
			const error = new CategoryNotFoundError(categoryId);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.JOB_CATEGORY_NOT_FOUND);
		});

		it("should include the category ID in the message", () => {
			const error = new CategoryNotFoundError(categoryId);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message");
			expect(response["message"] as string).toContain(categoryId);
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new CategoryNotFoundError(categoryId);
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new CategoryNotFoundError(categoryId);
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
