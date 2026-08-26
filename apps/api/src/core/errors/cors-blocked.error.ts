import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class CorsBlockedError extends DomainError {
	constructor(message: string = "The origin of this request is blocked.") {
		super(ErrorCode.CORS_BLOCKED, message, HttpStatus.FORBIDDEN);
	}
}
