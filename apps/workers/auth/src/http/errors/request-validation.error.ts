import type { ValidationViolation } from "@cataqui/response";
import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class RequestValidationError extends AppError {
	readonly violations: ValidationViolation[];

	constructor(params: { violations: ValidationViolation[] }) {
		super({ status: 400, errorCode: AppErrorCode.VALIDATION_ERROR, message: "The request contains invalid fields." });
		this.violations = params.violations;
	}
}
