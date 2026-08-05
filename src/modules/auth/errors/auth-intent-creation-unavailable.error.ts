import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class AuthIntentCreationUnavailableError extends DomainError {
	constructor() {
		super(
			ErrorCode.AUTH_INTENT_CREATION_UNAVAILABLE,
			"The WhatsApp authentication intent could not be created safely because its temporary storage is unavailable. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
