import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class RateLimitedError extends AppError {
	constructor(message: string = "Too many requests. Please try again later.") {
		super(ErrorCode.RATE_LIMITED, message, HttpStatus.TOO_MANY_REQUESTS);
	}
}
