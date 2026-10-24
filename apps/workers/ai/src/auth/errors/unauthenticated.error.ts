import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class UnauthenticatedError extends AppError {
	constructor() {
		super({ errorCode: AiErrorCode.UNAUTHENTICATED, message: "A valid session is required.", status: 401 });
	}
}
