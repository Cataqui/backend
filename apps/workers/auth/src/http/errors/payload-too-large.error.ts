import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PayloadTooLargeError extends AppError {
	constructor() {
		super({
			status: 413,
			errorCode: AppErrorCode.PAYLOAD_TOO_LARGE,
			message: "Request body exceeds the maximum allowed size.",
		});
	}
}
