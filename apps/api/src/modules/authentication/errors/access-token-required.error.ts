import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AccessTokenRequiredError extends AppError {
	constructor() {
		super(
			ErrorCode.ACCESS_TOKEN_REQUIRED,
			"A valid bearer session is required. Send the session token as Authorization: Bearer <accessToken>.",
			HttpStatus.UNAUTHORIZED,
		);
	}
}
