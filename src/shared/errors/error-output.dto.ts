import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { ErrorCode } from "./error-code.enum";

export class ErrorOutputDto {
	@Expose({ name: "error_code" })
	@ApiProperty({
		name: "error_code",
		description: "Stable error code identifying the problem",
		enum: ErrorCode,
		example: "POST_NOT_FOUND",
	})
	readonly errorCode: ErrorCode;

	@Expose()
	@ApiProperty({
		description: "Human-readable error message",
		example: "The requested post was not found.",
	})
	readonly message: string;

	constructor(errorCode: ErrorCode, message: string) {
		this.errorCode = errorCode;
		this.message = message;
	}
}
