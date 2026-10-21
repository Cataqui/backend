import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class ProfileCreationConflictError extends AppError {
	constructor() {
		super(
			ErrorCode.PROFILE_CREATION_CONFLICT,
			"A profile was already created with different onboarding information.",
			HttpStatus.CONFLICT,
		);
	}
}
