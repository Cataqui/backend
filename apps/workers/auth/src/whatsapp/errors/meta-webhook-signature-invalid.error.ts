import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class MetaWebhookSignatureInvalidError extends AppError {
	constructor() {
		super({
			status: 401,
			errorCode: AppErrorCode.META_WEBHOOK_SIGNATURE_INVALID,
			message: "The webhook signature is invalid.",
		});
	}
}
