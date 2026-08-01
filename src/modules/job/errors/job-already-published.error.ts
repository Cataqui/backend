import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobAlreadyPublishedError extends DomainError {
	constructor() {
		super(
			ErrorCode.JOB_ALREADY_PUBLISHED,
			"The job cannot be published because it was already published. Only draft jobs can be published.",
			HttpStatus.CONFLICT,
		);
	}
}
