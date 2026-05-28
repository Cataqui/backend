import { instanceToPlain } from "class-transformer";
import { ErrorCode } from "./error-code.enum";
import { ErrorOutputDto } from "./error-output.dto";

describe("ErrorOutputDto", () => {
	describe("constructor", () => {
		it("should assign errorCode and message", () => {
			const dto = new ErrorOutputDto(ErrorCode.POST_NOT_FOUND, "The requested post was not found");

			expect(dto.errorCode).toBe(ErrorCode.POST_NOT_FOUND);
			expect(dto.message).toBe("The requested post was not found");
		});

		it("should work with all ErrorCode values", () => {
			for (const code of Object.values(ErrorCode)) {
				const dto = new ErrorOutputDto(code, "test message");
				expect(dto.errorCode).toBe(code);
			}
		});
	});

	describe("serialization", () => {
		it("should serialize errorCode as snake_case error_code", () => {
			const dto = new ErrorOutputDto(ErrorCode.NOT_FOUND, "Not found");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("error_code");
			expect(plain["error_code"]).toBe(ErrorCode.NOT_FOUND);
		});

		it("should serialize message as-is", () => {
			const dto = new ErrorOutputDto(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("message");
			expect(plain["message"]).toBe("An unexpected error occurred");
		});

		it("should not have camelCase errorCode in serialized output", () => {
			const dto = new ErrorOutputDto(ErrorCode.VALIDATION_ERROR, "Validation failed");
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("errorCode");
			expect(Object.keys(plain)).toContain("error_code");
		});
	});
});
