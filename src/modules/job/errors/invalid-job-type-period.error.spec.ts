import { InvalidJobTypePeriodError } from "./invalid-job-type-period.error";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { JobPaymentAmountPeriod, JobType } from "../../../../generated/prisma/client.js";

describe("InvalidJobTypePeriodError", () => {
	it("should have code INVALID_JOB_TYPE_PAYMENT_PERIOD", () => {
		const error = new InvalidJobTypePeriodError();

		expect(error.errorCode).toBe(ErrorCode.INVALID_JOB_TYPE_PAYMENT_PERIOD);
	});

	it("should have a descriptive message in the response", () => {
		const error = new InvalidJobTypePeriodError();
		const response = error.getResponse() as Record<string, unknown>;

		expect(response).toHaveProperty("message");
		expect(response["message"] as string).toBe(`Only ${JobType.INDIVIDUAL} job type can have ${JobPaymentAmountPeriod.SINGLE} payment period`);
	});
});
