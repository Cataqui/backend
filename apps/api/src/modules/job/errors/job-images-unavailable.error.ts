import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobImagesUnavailableError extends AppError {
	constructor() {
		super(
			ErrorCode.JOB_LOCATION_IMAGES_UNAVAILABLE,
			"Job maps are not ready. Retry the unchanged submission with the same Idempotency-Key.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
