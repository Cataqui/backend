import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class InferenceUnavailableError extends AppError {
	constructor() {
		super({
			errorCode: AiErrorCode.INFERENCE_UNAVAILABLE,
			message: "Name-meaning inference is temporarily unavailable.",
			status: 503,
		});
	}
}
