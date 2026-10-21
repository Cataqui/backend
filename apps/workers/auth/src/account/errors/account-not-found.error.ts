import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AccountNotFoundError extends AppError {
	constructor() {
		super({
			status: 401,
			errorCode: AppErrorCode.ACCOUNT_NOT_FOUND,
			message: "The authenticated account no longer exists.",
		});
	}
}
