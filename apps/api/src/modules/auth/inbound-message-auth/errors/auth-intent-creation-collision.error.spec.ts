import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../../core/errors/error-code.enum";
import { AuthIntentCreationCollisionError } from "./auth-intent-creation-collision.error";

describe("AuthIntentCreationCollisionError", () => {
	it("should explain that repeated authentication intent creation attempts collided", () => {
		const error = new AuthIntentCreationCollisionError();

		expect({ errorCode: error.errorCode, message: error.message, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.AUTH_INTENT_CREATION_COLLISION,
			message:
				"The authentication intent could not be created because every generated credential set conflicted with an active intent. Please try again.",
			status: HttpStatus.SERVICE_UNAVAILABLE,
		});
	});
});
