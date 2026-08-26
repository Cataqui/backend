import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobContactNotFoundError } from "./job-contact-not-found.error";

describe("JobContactNotFoundError", () => {
	describe("constructor", () => {
		it("should set errorCode to JOB_CONTACT_NOT_FOUND", () => {
			const error = new JobContactNotFoundError();
			expect(error.errorCode).toBe(ErrorCode.JOB_CONTACT_NOT_FOUND);
		});

		it("should set HTTP status to 404", () => {
			const error = new JobContactNotFoundError();
			expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
		});

		it("should set the correct message", () => {
			const error = new JobContactNotFoundError();
			expect(error.message).toBe("The requested job contact was not found.");
		});
	});

	describe("getResponse", () => {
		it("should return object with JOB_CONTACT_NOT_FOUND errorCode", () => {
			const error = new JobContactNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("errorCode", ErrorCode.JOB_CONTACT_NOT_FOUND);
		});

		it("should include a message in response", () => {
			const error = new JobContactNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response).toHaveProperty("message");
		});

		it("should include the generic message in the response", () => {
			const error = new JobContactNotFoundError();
			const response = error.getResponse() as Record<string, unknown>;

			expect(response["message"]).toBe("The requested job contact was not found.");
		});
	});

	describe("inheritance", () => {
		it("should be an instance of Error", () => {
			const error = new JobContactNotFoundError();
			expect(error).toBeInstanceOf(Error);
		});

		it("should be an instance of DomainError", () => {
			const error = new JobContactNotFoundError();
			expect(error).toBeInstanceOf(DomainError);
		});
	});
});
