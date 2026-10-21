import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class RefreshSessionRevokedError extends AppError {
	constructor() {
		super({ status: 401, errorCode: AppErrorCode.INVALID_REFRESH_TOKEN, message: "The refresh session was revoked" });
	}
}
