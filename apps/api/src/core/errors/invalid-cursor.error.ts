import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class InvalidCursorError extends AppError {
	constructor(message?: string) {
		super(ErrorCode.INVALID_CURSOR, message ?? "The provided cursor is invalid or malformed.", HttpStatus.BAD_REQUEST);
	}
}
