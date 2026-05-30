import { InvalidJobTypeRecurrenceError } from "./invalid-job-type-recurrence.error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";
import { JobPaymentRecurrence, JobType } from "../../../../generated/prisma/client.js";

describe("InvalidJobTypeRecurrenceError", () => {
	it("should have code INVALID_JOB_TYPE_RECURRENCE", () => {
		const error = new InvalidJobTypeRecurrenceError();

		expect(error.errorCode).toBe(ErrorCode.INVALID_JOB_TYPE_RECURRENCE);
	});

	it("should have a descriptive message in the response", () => {
		const error = new InvalidJobTypeRecurrenceError();
		const response = error.getResponse() as Record<string, unknown>;

		expect(response).toHaveProperty("message");
		expect(response["message"] as string).toBe(`Only ${JobType.TASK} job type can have ${JobPaymentRecurrence.SINGLE} payment recurrence`);
	});
});
