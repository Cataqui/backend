import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobIdempotencyConflictError extends AppError {
	constructor() {
		super(
			ErrorCode.JOB_IDEMPOTENCY_CONFLICT,
			"This idempotency key was already used with different job content.",
			HttpStatus.CONFLICT,
		);
	}
}
