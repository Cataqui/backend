import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { AuthIntentCreationUnavailableError } from "./auth-intent-creation-unavailable.error";

describe("AuthIntentCreationUnavailableError", () => {
	it("should expose the stable authentication intent creation unavailable contract", () => {
		const error = new AuthIntentCreationUnavailableError();

		expect({ errorCode: error.errorCode, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.AUTH_INTENT_CREATION_UNAVAILABLE,
			status: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});
});
