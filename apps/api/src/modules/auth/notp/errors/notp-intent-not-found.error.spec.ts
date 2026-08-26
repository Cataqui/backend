import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../../core/errors/error-code.enum";
import { NotpIntentNotFoundError } from "./notp-intent-not-found.error";

describe("NotpIntentNotFoundError", () => {
	it("should expose one contract for unknown, expired, and incorrectly authenticated intents", () => {
		const error = new NotpIntentNotFoundError();

		expect({ errorCode: error.errorCode, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.NOTP_INTENT_NOT_FOUND,
			status: HttpStatus.NOT_FOUND,
		});
	});
});
