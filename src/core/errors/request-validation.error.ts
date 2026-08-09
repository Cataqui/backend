import { HttpException, HttpStatus } from "@nestjs/common";
import type { z } from "zod";
import type { ValidationViolationSchema } from "../validation/validation-violation.schema";
import { ErrorCode } from "./error-code.enum";

export class RequestValidationError extends HttpException {
	public override readonly errorCode = ErrorCode.VALIDATION_ERROR;

	constructor(params: { violations: z.infer<typeof ValidationViolationSchema>[] }) {
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
