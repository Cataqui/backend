import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InternalError extends AppError {
	constructor() {
		super({ status: 500, errorCode: AppErrorCode.INTERNAL_ERROR, message: "An internal error occurred." });
	}
}
