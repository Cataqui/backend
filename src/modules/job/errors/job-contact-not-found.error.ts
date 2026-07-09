import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobContactNotFoundError extends DomainError {
	constructor() {
		super(ErrorCode.JOB_CONTACT_NOT_FOUND, "The requested job contact was not found.", HttpStatus.NOT_FOUND);
	}
}
