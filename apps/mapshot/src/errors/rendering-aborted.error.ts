import { AppError } from "./app.error";
import { AppErrorCode } from "./app-error-code.enum";

export class RenderingAbortedError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.ABORTED, message: "Mapshot rendering was aborted." });
	}
}
