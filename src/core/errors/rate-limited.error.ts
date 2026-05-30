import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class RateLimitedError extends DomainError {
	constructor(message: string = "Too many requests. Please try again later.") {
		super(ErrorCode.RATE_LIMITED, message, HttpStatus.TOO_MANY_REQUESTS);
	}
}
