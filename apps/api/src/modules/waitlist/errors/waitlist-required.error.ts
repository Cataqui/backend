import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class WaitlistRequiredError extends AppError {
	constructor() {
		super(
			ErrorCode.WAITLIST_REQUIRED,
			"Join the waitlist before using an invite code to request admission.",
			HttpStatus.FORBIDDEN,
		);
	}
}
