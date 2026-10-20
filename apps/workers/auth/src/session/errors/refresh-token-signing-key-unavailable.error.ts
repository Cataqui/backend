import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class RefreshTokenSigningKeyUnavailableError extends AppError {
	constructor() {
		super({
			status: 500,
			errorCode: AppErrorCode.REFRESH_TOKEN_SIGNING_KEY_UNAVAILABLE,
			message: "The current refresh-token signing key is unavailable",
		});
	}
}
