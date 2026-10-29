import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class InviteUnavailableError extends AppError {
	constructor() {
		super(
			ErrorCode.INVITE_UNAVAILABLE,
			"The supplied inviteCode is unknown, disabled, or has reached its usage limit. Use another invite code.",
			HttpStatus.UNPROCESSABLE_ENTITY,
		);
	}
}
