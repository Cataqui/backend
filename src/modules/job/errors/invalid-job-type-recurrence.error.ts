import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";
import { JobPaymentRecurrence, JobType } from "../../../../generated/prisma/client.js";

export class InvalidJobTypeRecurrenceError extends DomainError {
	constructor() {
		super(ErrorCode.INVALID_JOB_TYPE_RECURRENCE, `Only ${JobType.TASK} job type can have ${JobPaymentRecurrence.SINGLE} payment recurrence`, HttpStatus.BAD_REQUEST);
	}
}
