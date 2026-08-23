import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobNotFoundError extends DomainError {
	constructor() {
		super(ErrorCode.JOB_NOT_FOUND, "The requested job was not found.", HttpStatus.NOT_FOUND);
	}
}
