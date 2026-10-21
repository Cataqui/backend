import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InvalidRequestError extends AppError {
	constructor() {
		super({
			status: 400,
			errorCode: AppErrorCode.INVALID_REQUEST,
			message: "The request body must contain valid JSON.",
		});
	}
}
