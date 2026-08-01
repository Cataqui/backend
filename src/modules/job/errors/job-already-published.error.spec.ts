import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobAlreadyPublishedError } from "./job-already-published.error";

describe("JobAlreadyPublishedError", () => {
	it("should explain that only draft jobs can be published", () => {
		const error = new JobAlreadyPublishedError();

		expect({
			code: error.errorCode,
			status: error.getStatus(),
			message: error.message,
		}).toEqual({
			code: ErrorCode.JOB_ALREADY_PUBLISHED,
			status: HttpStatus.CONFLICT,
			message: "The job cannot be published because it was already published. Only draft jobs can be published.",
		});
	});
});
