import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../../core/errors/error-code.enum";
import { NotpIntentCreationCollisionError } from "./notp-intent-creation-collision.error";

describe("NotpIntentCreationCollisionError", () => {
	it("should explain that repeated NOTP intent creation attempts collided", () => {
		const error = new NotpIntentCreationCollisionError();

		expect({ errorCode: error.errorCode, message: error.message, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.NOTP_INTENT_CREATION_COLLISION,
			message:
				"The NOTP intent could not be created because every generated credential set conflicted with an active intent. Please try again.",
			status: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});
});
