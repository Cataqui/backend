import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class RequestHeaderFieldsTooLargeError extends AppError {
	constructor(message: string = "Request header fields exceed the maximum allowed size.") {
		super(ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE, message, 431 as HttpStatus);
	}
}
