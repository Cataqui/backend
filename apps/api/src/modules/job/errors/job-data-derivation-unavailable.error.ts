import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobDataDerivationUnavailableError extends DomainError {
	constructor(params?: { cause?: unknown }) {
		super(
			ErrorCode.JOB_DATA_DERIVATION_UNAVAILABLE,
			"Important job data could not be derived from the supplied description because the derivation service did not return usable structured data. Please try again.",
			HttpStatus.SERVICE_UNAVAILABLE,
		);
		if (params?.cause !== undefined) this.cause = params.cause;
	}
}
