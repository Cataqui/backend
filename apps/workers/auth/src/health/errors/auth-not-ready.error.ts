import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AuthNotReadyError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: AppErrorCode.AUTH_NOT_READY,
			message: "An authentication dependency is unavailable.",
		});
	}
}
