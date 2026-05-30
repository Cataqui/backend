import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";
import { JobPaymentAmountPeriod, JobType } from "../../../../generated/prisma/client.js";

export class InvalidJobTypePeriodError extends DomainError {
	constructor() {
		super(ErrorCode.INVALID_JOB_TYPE_PAYMENT_PERIOD, `Only ${JobType.INDIVIDUAL} job type can have ${JobPaymentAmountPeriod.SINGLE} payment period`, HttpStatus.BAD_REQUEST);
	}
}
