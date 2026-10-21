import { AppError } from "./app.error";
import { AppErrorCode } from "./app-error-code.enum";

export class RenderingResourceUnavailableError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.RESOURCE_UNAVAILABLE, message: "A required rendering resource is unavailable." });
	}
}
