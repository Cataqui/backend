import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AuthSessionUnavailableError extends DomainError {
	constructor() {
		super(
			ErrorCode.AUTH_SESSION_UNAVAILABLE,
			"The authentication session operation could not be completed because session storage is temporarily unavailable. Try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
