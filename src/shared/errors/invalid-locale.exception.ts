import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { DomainError } from "./domain-error";

export class InvalidLocaleException extends DomainError {
	constructor(value: string) {
		super(
			ErrorCode.INVALID_LOCALE,
			`The Accept-Language header contains an invalid locale format: '${value}'. Expected BCP 47 format (e.g., en-US, pt-BR).`,
			HttpStatus.BAD_REQUEST,
		);
	}
}
