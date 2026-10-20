import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class MetaSubscriptionVerificationRejectedError extends AppError {
	constructor() {
		super({
			status: 403,
			errorCode: AppErrorCode.META_SUBSCRIPTION_VERIFICATION_REJECTED,
			message: "The subscription verification was rejected.",
		});
	}
}
