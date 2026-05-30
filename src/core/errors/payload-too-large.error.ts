import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class PayloadTooLargeError extends DomainError {
	constructor(message: string = "Request body exceeds the maximum allowed size.") {
		super(ErrorCode.PAYLOAD_TOO_LARGE, message, HttpStatus.PAYLOAD_TOO_LARGE);
	}
}
