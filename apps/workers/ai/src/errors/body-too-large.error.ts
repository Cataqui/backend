import { AiErrorCode } from "./ai-error-code.enum";
import { AppError } from "./app.error";

export class BodyTooLargeError extends AppError {
	constructor() {
		super({ errorCode: AiErrorCode.BODY_TOO_LARGE, message: "The request body exceeds 4 KiB.", status: 413 });
	}
}
