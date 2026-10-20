import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NotpAccountPersistenceFailedError extends AppError {
	constructor() {
		super({
			status: 500,
			errorCode: AppErrorCode.NOTP_ACCOUNT_PERSISTENCE_FAILED,
			message: "Verified identity persistence returned no account",
		});
	}
}
