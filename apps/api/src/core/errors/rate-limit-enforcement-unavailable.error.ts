import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class RateLimitEnforcementUnavailableError extends DomainError {
	constructor(params: { cause: unknown }) {
		super(
			ErrorCode.RATE_LIMIT_ENFORCEMENT_UNAVAILABLE,
			"The request could not be processed because abuse protection is temporarily unavailable. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
		this.cause = params.cause;
	}
}
