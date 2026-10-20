import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NotpProcessingInProgressError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: AppErrorCode.NOTP_PROCESSING_IN_PROGRESS,
			message: "The NOTP message is still processing and must be retried after recovery.",
		});
	}
}
