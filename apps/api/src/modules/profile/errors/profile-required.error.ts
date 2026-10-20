import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class ProfileRequiredError extends AppError {
	constructor() {
		super(
			ErrorCode.PROFILE_REQUIRED,
			"Create a Cataquí profile before performing this operation.",
			HttpStatus.CONFLICT,
		);
	}
}
