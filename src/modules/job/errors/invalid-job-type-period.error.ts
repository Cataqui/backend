import { HttpStatus } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobType } from "../../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class InvalidEmploymentPaymentError extends DomainError {
	constructor() {
		super(
			ErrorCode.INVALID_JOB_TYPE_PAYMENT_PERIOD,
			`payment.amountPeriod cannot be ${JobPaymentAmountPeriod.SINGLE} when type is ${JobType.EMPLOYMENT}. Employment must use a recurring payment period (${Object.values(
				JobPaymentAmountPeriod,
			)
				.filter((period) => period !== JobPaymentAmountPeriod.SINGLE)
				.join(", ")}). Example: type=${JobType.EMPLOYMENT}, payment.amountPeriod=${JobPaymentAmountPeriod.MONTHLY}.`,
			HttpStatus.BAD_REQUEST,
		);
	}
}
