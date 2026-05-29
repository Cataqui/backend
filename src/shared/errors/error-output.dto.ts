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

	@Expose()
	@ApiProperty({
		description: "HTTP status code",
		example: 404,
	})
	readonly status: number;

	@Expose({ name: "request_id" })
	@ApiProperty({
		name: "request_id",
		description: "Unique request identifier for tracing",
		example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	})
	readonly requestId: string;

	@Expose()
	@ApiProperty({
		description: "ISO 8601 timestamp of when the error occurred",
		example: "2026-05-28T10:00:00.000Z",
	})
	readonly timestamp: string;

	@Expose()
	@ApiProperty({
		description: "The requested endpoint path",
		example: "/api/v1/posts/abc123",
	})
	readonly endpoint: string;

	constructor(errorCode: ErrorCode, message: string, status: number, requestId: string, timestamp: string, endpoint: string) {
		this.errorCode = errorCode;
		this.message = message;
		this.status = status;
		this.requestId = requestId;
		this.timestamp = timestamp;
		this.endpoint = endpoint;
	}
}
