import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AccountAlreadyAdmittedError extends AppError {
	constructor() {
		super(
			ErrorCode.ACCOUNT_ALREADY_ADMITTED,
			"The account is already admitted and cannot join the waitlist.",
			HttpStatus.CONFLICT,
		);
	}
}
