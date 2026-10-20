import { HttpException, HttpStatus } from "@nestjs/common";
import type { ValidationViolation } from "@cataqui/response";
import { ErrorCode } from "./error-code.enum";

export class RequestValidationError extends HttpException {
	public override readonly errorCode = ErrorCode.VALIDATION_ERROR;

	constructor(params: { violations: ValidationViolation[] }) {
		super(
			{
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				violations: params.violations,
			},
			HttpStatus.BAD_REQUEST,
		);
	}
}
