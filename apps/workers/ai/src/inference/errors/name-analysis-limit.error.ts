import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class NameAnalysisLimitError extends AppError {
	constructor() {
		super({
			errorCode: AiErrorCode.NAME_ANALYSIS_LIMIT,
			message: "The account name-analysis request limit was reached.",
			status: 429,
		});
	}
}
