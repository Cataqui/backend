import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InvalidRefreshTokenError extends AppError {
	constructor() {
		super({ status: 401, errorCode: AppErrorCode.INVALID_REFRESH_TOKEN, message: "The refresh token is invalid" });
	}
}
