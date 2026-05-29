import { instanceToPlain } from "class-transformer";
import { ErrorCode } from "./error-code.enum";
import { ErrorOutputDto } from "./error-output.dto";

describe("ErrorOutputDto", () => {
	describe("constructor", () => {
		it("should assign all fields", () => {
			const dto = new ErrorOutputDto(ErrorCode.POST_NOT_FOUND, "The requested post was not found", 404, "req-123", "2026-05-28T10:00:00.000Z", "/api/v1/posts/123");

			expect(dto.errorCode).toBe(ErrorCode.POST_NOT_FOUND);
			expect(dto.message).toBe("The requested post was not found");
			expect(dto.status).toBe(404);
			expect(dto.requestId).toBe("req-123");
			expect(dto.timestamp).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.endpoint).toBe("/api/v1/posts/123");
		});
	});

	describe("serialization", () => {
		it("should serialize errorCode as error_code", () => {
			const dto = new ErrorOutputDto(ErrorCode.NOT_FOUND, "Not found", 404, "req-1", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("error_code", ErrorCode.NOT_FOUND);
			expect(plain).not.toHaveProperty("errorCode");
		});

		it("should serialize message as-is", () => {
			const dto = new ErrorOutputDto(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", 500, "req-1", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("message", "An unexpected error occurred");
		});

		it("should serialize status as number", () => {
			const dto = new ErrorOutputDto(ErrorCode.NOT_FOUND, "Not found", 404, "req-1", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("status", 404);
			expect(typeof plain["status"]).toBe("number");
		});

		it("should serialize requestId as request_id", () => {
			const dto = new ErrorOutputDto(ErrorCode.VALIDATION_ERROR, "Bad request", 400, "my-request-id", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("request_id", "my-request-id");
			expect(plain).not.toHaveProperty("requestId");
		});

		it("should serialize timestamp as-is", () => {
			const dto = new ErrorOutputDto(ErrorCode.RATE_LIMITED, "Too many", 429, "req-1", "2026-05-28T10:00:00.000Z", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("timestamp", "2026-05-28T10:00:00.000Z");
		});

		it("should serialize endpoint as-is", () => {
			const dto = new ErrorOutputDto(ErrorCode.NOT_FOUND, "Not found", 404, "req-1", "ts", "/api/v1/posts/123");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("endpoint", "/api/v1/posts/123");
		});

		it("should not include any camelCase keys", () => {
			const dto = new ErrorOutputDto(ErrorCode.VALIDATION_ERROR, "Validation failed", 400, "req-1", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("errorCode");
			expect(plain).not.toHaveProperty("requestId");
			expect(Object.keys(plain).sort()).toEqual(["endpoint", "error_code", "message", "request_id", "status", "timestamp"]);
		});
	});
});
