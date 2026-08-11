import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class InvalidCursorError extends DomainError {
	constructor(message?: string) {
		super(ErrorCode.INVALID_CURSOR, message ?? "The provided cursor is invalid or malformed.", HttpStatus.BAD_REQUEST);
	}
}
