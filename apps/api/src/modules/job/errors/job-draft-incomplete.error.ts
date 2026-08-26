import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobDraftIncompleteError extends DomainError {
	constructor(params: { missingFields: string[] }) {
		super(
			ErrorCode.JOB_DRAFT_INCOMPLETE,
			`The draft cannot be published because these required fields are missing: ${params.missingFields.join(", ")}. Update them and try again.`,
			HttpStatus.BAD_REQUEST,
		);
	}
}
