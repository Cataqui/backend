import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class InvalidCursorError extends DomainError {
	constructor(message?: string) {
		super(ErrorCode.INVALID_CURSOR, message ?? "The provided cursor is invalid or malformed.", HttpStatus.BAD_REQUEST);
	}
}
