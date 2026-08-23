import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../../core/errors/domain-error";
import { ErrorCode } from "../../../../core/errors/error-code.enum";

export class AuthIntentCreationCollisionError extends DomainError {
	constructor() {
		super(
			ErrorCode.AUTH_INTENT_CREATION_COLLISION,
			"The authentication intent could not be created because every generated credential set conflicted with an active intent. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
