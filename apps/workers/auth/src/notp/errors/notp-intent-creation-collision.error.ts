import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NotpIntentCreationCollisionError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: AppErrorCode.NOTP_INTENT_CREATION_COLLISION,
			message: "The NOTP intent could not be created. Please try again.",
		});
	}
}
