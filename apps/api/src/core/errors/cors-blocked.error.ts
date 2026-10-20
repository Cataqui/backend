import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class CorsBlockedError extends AppError {
	constructor(message: string = "The origin of this request is blocked.") {
		super(ErrorCode.CORS_BLOCKED, message, HttpStatus.FORBIDDEN);
	}
}
