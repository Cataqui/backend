import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class UriTooLongError extends DomainError {
	constructor(message: string = "Request URL exceeds the maximum allowed length.") {
		super(ErrorCode.URI_TOO_LONG, message, HttpStatus.URI_TOO_LONG);
	}
}
