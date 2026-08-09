import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../../core/errors/error-code.enum";
import { AuthIntentNotFoundError } from "./auth-intent-not-found.error";

describe("AuthIntentNotFoundError", () => {
	it("should expose one contract for unknown, expired, and incorrectly authenticated intents", () => {
		const error = new AuthIntentNotFoundError();

		expect({ errorCode: error.errorCode, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.AUTH_INTENT_NOT_FOUND,
			status: HttpStatus.NOT_FOUND,
		});
	});
});
