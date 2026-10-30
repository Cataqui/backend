import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InvalidModelResponseError extends AppError {
	constructor() {
		super({
			errorCode: AiErrorCode.INVALID_MODEL_RESPONSE,
			message: "The model returned an invalid name-analysis response.",
			status: 502,
		});
	}
}
