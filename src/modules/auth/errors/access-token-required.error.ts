import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AccessTokenRequiredError extends DomainError {
	constructor() {
		super(
			ErrorCode.ACCESS_TOKEN_REQUIRED,
			"A valid bearer session is required. Send the session token as Authorization: Bearer <accessToken>.",
			HttpStatus.UNAUTHORIZED,
		);
	}
}
