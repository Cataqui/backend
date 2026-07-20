import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobNotFoundError } from "./job-not-found.error";

describe("JobNotFoundError", () => {
	describe("constructor", () => {
		it("should set errorCode to JOB_NOT_FOUND", () => {
			const error = new JobNotFoundError();
			expect(error.errorCode).toBe(ErrorCode.JOB_NOT_FOUND);
		});

		it("should set HTTP status to 404", () => {
			const error = new JobNotFoundError();
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should set the correct message", () => {
			const error = new JobNotFoundError();
			expect(error.message).toBe("The requested job was not found.");
		});
	});

	describe("getResponse", () => {
		it("should return object with JOB_NOT_FOUND error_code", () => {
			const error = new JobNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.JOB_NOT_FOUND);
		});

		it("should include a message in response", () => {
			const error = new JobNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message");
		});

		it("should include the generic message in the response", () => {
			const error = new JobNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response["message"]).toBe("The requested job was not found.");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new JobNotFoundError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new JobNotFoundError();
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
