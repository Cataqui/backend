import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class SuccessResponseDto<T> {
	@Expose({ name: "data" })
	@ApiProperty({ name: "data", description: "The response payload" })
	readonly data: T;

	@Expose({ name: "request_id" })
	@ApiProperty({
		name: "request_id",
		description: "Unique request identifier for tracing",
		example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	})
	readonly requestId: string;

	@Expose()
	@ApiProperty({
		description: "ISO 8601 timestamp of when the response was generated",
		example: "2026-05-28T10:00:00.000Z",
	})
	readonly timestamp: string;

	@Expose()
	@ApiProperty({
		description: "The requested endpoint path",
		example: "/v1/posts/abc123",
	})
	readonly endpoint: string;

	constructor(data: T, requestId: string, timestamp: string, endpoint: string) {
		this.data = data;
		this.requestId = requestId;
		this.timestamp = timestamp;
		this.endpoint = endpoint;
	}
}
