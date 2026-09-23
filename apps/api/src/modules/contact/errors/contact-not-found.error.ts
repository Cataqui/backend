import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class ContactNotFoundError extends DomainError {
	constructor() {
		super(ErrorCode.CONTACT_NOT_FOUND, "The requested contact was not found.", HttpStatus.NOT_FOUND);
	}
}
