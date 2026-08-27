import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobDataDerivationUnavailableError } from "./job-data-derivation-unavailable.error";

describe("JobDataDerivationUnavailableError", () => {
	it("should expose the stable job data derivation unavailable contract", () => {
		const error = new JobDataDerivationUnavailableError();

		expect({
			errorCode: error.errorCode,
			status: error.getStatus(),
		}).toEqual({
			errorCode: ErrorCode.JOB_DATA_DERIVATION_UNAVAILABLE,
			status: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});

	it("should preserve an internal derivation failure as its cause", () => {
		const cause = new Error("provider unavailable");

		const error = new JobDataDerivationUnavailableError({ cause: cause });

		expect(error.cause).toBe(cause);
	});
});
