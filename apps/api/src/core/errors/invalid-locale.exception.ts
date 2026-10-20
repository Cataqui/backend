import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class InvalidLocaleException extends AppError {
	constructor(value: string) {
		super(
			ErrorCode.INVALID_LOCALE,
			`The Accept-Language header contains an invalid locale format: '${value}'. Expected BCP 47 format (e.g., en-US, pt-BR).`,
			HttpStatus.BAD_REQUEST,
		);
	}
}
