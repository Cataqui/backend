import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";

export class JobNotFoundError extends DomainError {
	constructor(jobId: string) {
		super(ErrorCode.JOB_NOT_FOUND, `Job with ID '${jobId}' was not found.`, HttpStatus.NOT_FOUND);
	}
}
