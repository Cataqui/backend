import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { DomainError } from "../../../core/errors/domain-error";
import { JobNotFoundError } from "./job-not-found.error";

describe("JobNotFoundError", () => {
	const jobId = "cm3x-1234-abcd";

	describe("constructor", () => {
		it("should set errorCode to JOB_NOT_FOUND", () => {
			const error = new JobNotFoundError(jobId);
			expect(error.errorCode).toBe(ErrorCode.JOB_NOT_FOUND);
		});

		it("should set HTTP status to 404", () => {
			const error = new JobNotFoundError(jobId);
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should include the job ID in the message", () => {
			const error = new JobNotFoundError(jobId);
			expect(error.message).toContain(jobId);
		});
	});

	describe("getResponse", () => {
		it("should return object with JOB_NOT_FOUND error_code", () => {
			const error = new JobNotFoundError(jobId);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("error_code", ErrorCode.JOB_NOT_FOUND);
		});

		it("should include the job ID in the message", () => {
			const error = new JobNotFoundError(jobId);
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message");
			expect(response["message"] as string).toContain(jobId);
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new JobNotFoundError(jobId);
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new JobNotFoundError(jobId);
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
