import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class CategoryNotFoundError extends DomainError {
	constructor(status: HttpStatus) {
		super(ErrorCode.JOB_CATEGORY_NOT_FOUND, "The requested category was not found.", status);
	}
}
