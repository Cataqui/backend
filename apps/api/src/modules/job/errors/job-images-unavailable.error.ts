import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobImagesUnavailableError extends DomainError {
	constructor() {
		super(
			ErrorCode.JOB_LOCATION_IMAGES_UNAVAILABLE,
			"Job maps are not ready. Retry the unchanged submission with the same Idempotency-Key.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
