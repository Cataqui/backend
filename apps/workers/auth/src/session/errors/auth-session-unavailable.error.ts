import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AuthSessionUnavailableError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: AppErrorCode.AUTH_SESSION_UNAVAILABLE,
			message: "The authentication session is unavailable",
		});
	}
}
