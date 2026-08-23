import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";

export abstract class DomainError extends HttpException {
	public override readonly errorCode: ErrorCode;

	constructor(errorCode: ErrorCode, message: string, status: HttpStatus) {
		super({ errorCode: errorCode, message: message }, status);
		this.errorCode = errorCode;
	}
}
