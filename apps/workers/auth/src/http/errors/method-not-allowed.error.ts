import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class MethodNotAllowedError extends AppError {
	constructor() {
		super({
			status: 405,
			errorCode: AppErrorCode.METHOD_NOT_ALLOWED,
			message: "The requested HTTP method is not supported.",
		});
	}
}
