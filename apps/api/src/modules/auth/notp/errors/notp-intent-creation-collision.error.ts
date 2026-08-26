import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../../core/errors/domain-error";
import { ErrorCode } from "../../../../core/errors/error-code.enum";

export class NotpIntentCreationCollisionError extends DomainError {
	constructor() {
		super(
			ErrorCode.NOTP_INTENT_CREATION_COLLISION,
			"The NOTP intent could not be created because every generated credential set conflicted with an active intent. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
