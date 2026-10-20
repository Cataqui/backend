import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class ProfileNotFoundError extends AppError {
	constructor() {
		super(ErrorCode.PROFILE_NOT_FOUND, "The authenticated account has no Cataquí profile.", HttpStatus.NOT_FOUND);
	}
}
