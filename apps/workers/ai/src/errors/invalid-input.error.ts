import type { ValidationViolation } from "@cataqui/response";
import { AiErrorCode } from "./ai-error-code.enum";
import { AppError } from "./app.error";

export class InvalidInputError extends AppError {
	readonly violations: ValidationViolation[];
	constructor(params: { violations: ValidationViolation[] }) {
		super({ errorCode: AiErrorCode.INVALID_INPUT, message: "The request input is invalid.", status: 400 });
		this.violations = params.violations;
	}
}
