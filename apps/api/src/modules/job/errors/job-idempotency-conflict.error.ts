import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobIdempotencyConflictError extends DomainError {
	constructor() {
		super(
			ErrorCode.JOB_IDEMPOTENCY_CONFLICT,
			"This idempotency key was already used with different job content.",
			HttpStatus.CONFLICT,
		);
	}
}
