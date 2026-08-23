import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobDraftIncompleteError } from "./job-draft-incomplete.error";

describe("JobDraftIncompleteError", () => {
	it("should expose missing fields through a stable bad-request contract", () => {
		const error = new JobDraftIncompleteError({
			missingFields: ["contact", "location"],
		});

		expect({
			code: error.errorCode,
			status: error.getStatus(),
			message: error.message,
		}).toEqual({
			code: ErrorCode.JOB_DRAFT_INCOMPLETE,
			status: HttpStatus.BAD_REQUEST,
			message:
				"The draft cannot be published because these required fields are missing: contact, location. Update them and try again.",
		});
	});
});
