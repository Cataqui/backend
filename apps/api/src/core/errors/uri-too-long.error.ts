import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class UriTooLongError extends AppError {
	constructor(message: string = "Request URL exceeds the maximum allowed length.") {
		super(ErrorCode.URI_TOO_LONG, message, HttpStatus.URI_TOO_LONG);
	}
}
