import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InvalidWhatsappWebhookError extends AppError {
	constructor() {
		super({
			status: 500,
			errorCode: AppErrorCode.INVALID_WHATSAPP_WEBHOOK,
			message: "Authenticated WhatsApp webhook payload is invalid",
		});
	}
}
