import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NotpIntentNotFoundError extends AppError {
	constructor() {
		super({
			status: 404,
			errorCode: AppErrorCode.NOTP_INTENT_NOT_FOUND,
			message: "The NOTP intent was not found or has expired. Create a new intent.",
		});
	}
}
