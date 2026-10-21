import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class WhatsappContactIdentifierRequiredError extends AppError {
	constructor() {
		super({
			status: 500,
			errorCode: AppErrorCode.WHATSAPP_CONTACT_IDENTIFIER_REQUIRED,
			message: "NOTP requires a provider contact identifier",
		});
	}
}
