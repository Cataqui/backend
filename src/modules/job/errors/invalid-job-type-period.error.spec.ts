import { JobPaymentAmountPeriod, JobType } from "../../../../generated/prisma/client.js";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { InvalidEmploymentPaymentError } from "./invalid-job-type-period.error";

describe("InvalidJobTypePeriodError", () => {
	it("should have code INVALID_JOB_TYPE_PAYMENT_PERIOD", () => {
		const error = new InvalidEmploymentPaymentError();

		expect(error.errorCode).toBe(ErrorCode.INVALID_JOB_TYPE_PAYMENT_PERIOD);
	});

	it("should have a descriptive message in the response", () => {
		const error = new InvalidEmploymentPaymentError();
		const response = error.getResponse() as Record<string, unknown>;

		expect(response["message"] as string).toBe(
			`payment.amount_period cannot be ${JobPaymentAmountPeriod.SINGLE} when type is ${JobType.EMPLOYMENT}. Employment must use a recurring payment period (${Object.values(
				JobPaymentAmountPeriod,
			)
				.filter((period) => period !== JobPaymentAmountPeriod.SINGLE)
				.join(", ")}). Example: type=${JobType.EMPLOYMENT}, payment.amount_period=${JobPaymentAmountPeriod.MONTHLY}.`,
		);
	});
});
