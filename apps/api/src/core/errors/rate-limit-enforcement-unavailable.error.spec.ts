import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { RateLimitEnforcementUnavailableError } from "./rate-limit-enforcement-unavailable.error";

describe("RateLimitEnforcementUnavailableError", () => {
	it("should expose a typed server-availability contract", () => {
		const error = new RateLimitEnforcementUnavailableError({ cause: new Error("Redis unavailable") });

		expect({ errorCode: error.errorCode, statusCode: error.getStatus() }).toEqual({
			errorCode: ErrorCode.RATE_LIMIT_ENFORCEMENT_UNAVAILABLE,
			statusCode: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});

	it("should preserve the enforcement failure as its cause", () => {
		const cause = new Error("Redis unavailable");

		const error = new RateLimitEnforcementUnavailableError({ cause: cause });

		expect(error.cause).toBe(cause);
	});
});
