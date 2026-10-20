import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AccessTokenRequiredError extends AppError {
	constructor() {
		super({
			status: 401,
			errorCode: AppErrorCode.ACCESS_TOKEN_REQUIRED,
			message: "A valid bearer session is required. Send the session token as Authorization: Bearer <accessToken>.",
		});
	}
}
