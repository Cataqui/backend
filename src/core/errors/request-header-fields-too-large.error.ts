import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class RequestHeaderFieldsTooLargeError extends DomainError {
	constructor(message: string = "Request header fields exceed the maximum allowed size.") {
		super(ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE, message, 431 as HttpStatus);
	}
}
