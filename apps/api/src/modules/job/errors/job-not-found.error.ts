import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../../core/errors/app-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class JobNotFoundError extends AppError {
	constructor() {
		super(ErrorCode.JOB_NOT_FOUND, "The requested job was not found.", HttpStatus.NOT_FOUND);
	}
}
