import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NotpProcessingOwnershipLostError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: AppErrorCode.NOTP_PROCESSING_OWNERSHIP_LOST,
			message: "The NOTP verification could not complete because its processing lease was lost.",
		});
	}
}
