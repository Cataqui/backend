import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobDataDerivationUnavailableError extends AppError {
	constructor() {
		super(
			ErrorCode.JOB_DATA_DERIVATION_UNAVAILABLE,
			"Important job data could not be derived from the supplied description because the derivation service did not return usable structured data. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
	}
}
