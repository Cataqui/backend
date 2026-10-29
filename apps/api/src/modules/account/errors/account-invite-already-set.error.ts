import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AccountInviteAlreadySetError extends AppError {
	constructor() {
		super(
			ErrorCode.ACCOUNT_INVITE_ALREADY_SET,
			"The account's invite code has already been set and cannot be changed.",
			HttpStatus.CONFLICT,
		);
	}
}
