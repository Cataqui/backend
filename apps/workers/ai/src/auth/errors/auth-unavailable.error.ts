import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AuthUnavailableError extends AppError {
	constructor() {
		super({
			errorCode: AiErrorCode.AUTH_UNAVAILABLE,
			message: "Authentication is temporarily unavailable.",
			status: 503,
		});
	}
}
