import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobNotFoundError extends DomainError {
	constructor(jobId: string) {
		super(ErrorCode.JOB_NOT_FOUND, `Job with ID '${jobId}' was not found.`, HttpStatus.NOT_FOUND);
	}
}
