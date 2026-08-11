import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobAlreadyPublishedError } from "./job-already-published.error";

describe("JobAlreadyPublishedError", () => {
	it("should explain why a closed job cannot be published again", () => {
		const error = new JobAlreadyPublishedError();

		expect({
			code: error.errorCode,
			status: error.getStatus(),
			message: error.message,
		}).toEqual({
			code: ErrorCode.JOB_ALREADY_PUBLISHED,
			status: HttpStatus.CONFLICT,
			message:
				"The job cannot be published because it is closed. Repeating publication is allowed only while the job remains active.",
		});
	});
});
