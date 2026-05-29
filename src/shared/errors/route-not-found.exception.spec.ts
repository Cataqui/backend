import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";
import { RouteNotFoundException } from "./route-not-found.exception";

describe("RouteNotFoundException", () => {
	describe("constructor", () => {
		it("should set errorCode to ROUTE_NOT_FOUND", () => {
			const error = new RouteNotFoundException();
			expect(error.errorCode).toBe(ErrorCode.ROUTE_NOT_FOUND);
		});

		it("should set HTTP status to 404", () => {
			const error = new RouteNotFoundException();
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should set a friendly message", () => {
			const error = new RouteNotFoundException();
			expect(error.message).toBe("The requested endpoint was not found. Perhaps you meant to use a different HTTP method?");
		});
	});

	describe("getResponse", () => {
		it("should return object with ROUTE_NOT_FOUND error_code", () => {
			const error = new RouteNotFoundException();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.ROUTE_NOT_FOUND);
		});

		it("should include the friendly message", () => {
			const error = new RouteNotFoundException();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message", "The requested endpoint was not found. Perhaps you meant to use a different HTTP method?");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new RouteNotFoundException();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new RouteNotFoundException();
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
