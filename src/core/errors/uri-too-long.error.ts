import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class UriTooLongError extends DomainError {
	constructor(message: string = "Request URL exceeds the maximum allowed length.") {
		super(ErrorCode.URI_TOO_LONG, message, HttpStatus.URI_TOO_LONG);
	}
}
