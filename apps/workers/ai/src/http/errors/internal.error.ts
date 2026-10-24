import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InternalError extends AppError {
	constructor() {
		super({ status: 500, errorCode: AiErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred." });
	}
}
