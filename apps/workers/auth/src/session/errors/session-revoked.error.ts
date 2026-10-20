import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class SessionRevokedError extends AppError {
	constructor() {
		super({
			status: 401,
			errorCode: AppErrorCode.SESSION_REVOKED,
			message: "The authentication session was revoked while issuing credentials",
		});
	}
}
