import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../../core/errors/domain-error";
import { ErrorCode } from "../../../../core/errors/error-code.enum";

export class NotpIntentNotFoundError extends DomainError {
	constructor() {
		super(
			ErrorCode.NOTP_INTENT_NOT_FOUND,
			"The NOTP intent was not found or has expired. Create a new intent and use the exact intentToken returned by the API.",
			HttpStatus.NOT_FOUND,
		);
	}
}
