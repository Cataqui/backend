import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class InvalidRefreshTokenError extends DomainError {
	constructor() {
		super(
			ErrorCode.INVALID_REFRESH_TOKEN,
			"The refresh token is invalid, expired, revoked, or already used. Authenticate again.",
			HttpStatus.UNAUTHORIZED,
		);
	}
}
