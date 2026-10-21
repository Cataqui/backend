import { AppError } from "./app.error";
import { AppErrorCode } from "./app-error-code.enum";

export class InvalidRenderingResourceError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.INVALID_RESOURCE, message: "The requested rendering resource is invalid." });
	}
}
