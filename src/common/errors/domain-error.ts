import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";

export abstract class DomainError extends HttpException {
	public readonly errorCode: ErrorCode;

	constructor(errorCode: ErrorCode, message: string, status: HttpStatus) {
		super({ error_code: errorCode, message }, status);
		this.errorCode = errorCode;
	}
}
