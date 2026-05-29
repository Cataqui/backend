import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";

export class CategoryNotFoundError extends DomainError {
	constructor(categoryId: string) {
		super(ErrorCode.JOB_CATEGORY_NOT_FOUND, `Category with ID '${categoryId}' was not found.`, HttpStatus.NOT_FOUND);
	}
}
