import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NameMeaningLimitError extends AppError {
	constructor() {
		super({
			errorCode: AiErrorCode.NAME_MEANING_LIMIT,
			message: "The account name-meaning request limit was reached.",
			status: 429,
		});
	}
}
