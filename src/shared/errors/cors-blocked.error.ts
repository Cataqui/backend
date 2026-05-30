import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class CorsBlockedError extends DomainError {
	constructor(message: string = "The origin of this request is blocked.") {
		super(ErrorCode.CORS_BLOCKED, message, HttpStatus.FORBIDDEN);
	}
}
