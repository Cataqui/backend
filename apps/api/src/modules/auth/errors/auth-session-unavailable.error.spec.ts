import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { AuthSessionUnavailableError } from "./auth-session-unavailable.error";

describe("AuthSessionUnavailableError", () => {
	it("should expose the stable session storage unavailable contract", () => {
		const error = new AuthSessionUnavailableError();

		expect({ errorCode: error.errorCode, message: error.message, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.AUTH_SESSION_UNAVAILABLE,
			message:
				"The authentication session operation could not be completed because session storage is temporarily unavailable. Try again.",
			status: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});
});
