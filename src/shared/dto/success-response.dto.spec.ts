import { instanceToPlain } from "class-transformer";
import { SuccessResponseDto } from "./success-response.dto";

describe("SuccessResponseDto", () => {
	describe("constructor", () => {
		it("should assign data, requestId, timestamp, endpoint", () => {
			const dto = new SuccessResponseDto({ id: 1 }, "req-123", "2026-05-28T10:00:00.000Z", "/api/v1/test");

			expect(dto.data).toEqual({ id: 1 });
			expect(dto.requestId).toBe("req-123");
			expect(dto.timestamp).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.endpoint).toBe("/api/v1/test");
		});

		it("should accept primitive data types", () => {
			const strDto = new SuccessResponseDto("hello", "req-1", "ts", "/test");
			expect(strDto.data).toBe("hello");

			const numDto = new SuccessResponseDto(42, "req-2", "ts", "/test");
			expect(numDto.data).toBe(42);

			const boolDto = new SuccessResponseDto(true, "req-3", "ts", "/test");
			expect(boolDto.data).toBe(true);
		});
	});

	describe("serialization", () => {
		it("should serialize to data, request_id, timestamp, endpoint", () => {
			const dto = new SuccessResponseDto({ someField: "value" }, "req-abc", "2026-05-28T10:00:00.000Z", "/api/v1/posts/123");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("data");
			expect(plain).toHaveProperty("request_id", "req-abc");
			expect(plain).toHaveProperty("timestamp", "2026-05-28T10:00:00.000Z");
			expect(plain).toHaveProperty("endpoint", "/api/v1/posts/123");
		});

		it("should rename requestId to request_id", () => {
			const dto = new SuccessResponseDto(null, "req-xyz", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("request_id");
			expect(plain).not.toHaveProperty("requestId");
		});

		it("should keep data field as data (no rename)", () => {
			const dto = new SuccessResponseDto({ key: "val" }, "req", "ts", "/test");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("data");
			expect(plain["data"]).toEqual({ key: "val" });
		});
	});
});
