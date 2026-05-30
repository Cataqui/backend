import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class RequestHeaderFieldsTooLargeError extends DomainError {
	constructor(message: string = "Request header fields exceed the maximum allowed size.") {
		super(ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE, message, 431 as HttpStatus);
	}
}
