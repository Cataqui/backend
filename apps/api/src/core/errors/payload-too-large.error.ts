import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class PayloadTooLargeError extends AppError {
	constructor(message: string = "Request body exceeds the maximum allowed size.") {
		super(ErrorCode.PAYLOAD_TOO_LARGE, message, HttpStatus.PAYLOAD_TOO_LARGE);
	}
}
