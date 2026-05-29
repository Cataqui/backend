import { HttpStatus } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client.js";
import { ErrorCode } from "../../errors/error-code.enum.js";
import { PrismaExceptionFilter } from "./prisma-exception.filter.js";

function createMockHost(exception: Prisma.PrismaClientKnownRequestError, requestId?: string) {
	const statusMock = vi.fn();
	const sendMock = vi.fn();
	const response = { status: statusMock.mockReturnValue({ send: sendMock }) };
	const request = {
		method: "GET",
		url: "/api/v1/posts",
		headers: requestId ? { "x-request-id": requestId } : {},
	};

	const host = {
		switchToHttp: () => ({
			getResponse: () => response,
			getRequest: () => request,
		}),
	};

	const filter = new PrismaExceptionFilter();
	filter.catch(exception, host as never);

	return { statusMock, sendMock, response, request };
}

function createMockPrismaError(code: string): Prisma.PrismaClientKnownRequestError {
	return {
		code,
		meta: {},
		message: `Prisma error ${code}`,
		stack: "Error stack",
	} as unknown as Prisma.PrismaClientKnownRequestError;
}

describe("PrismaExceptionFilter", () => {
	describe("P2025 - not found", () => {
		it("should return 404 with NOT_FOUND error_code", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2025"));

			expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.NOT_FOUND);
			expect(body).toHaveProperty("message", "The requested record was not found or could not be accessed.");
			expect(body).toHaveProperty("status", HttpStatus.NOT_FOUND);
			expect(body).toHaveProperty("request_id", expect.any(String));
			expect(body).toHaveProperty("timestamp", expect.any(String));
			expect(body).toHaveProperty("endpoint", "/api/v1/posts");
		});
	});

	describe("P2002 - unique constraint", () => {
		it("should return 409 with VALIDATION_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2002"));

			expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.VALIDATION_ERROR);
			expect(body).toHaveProperty("status", HttpStatus.CONFLICT);
		});
	});

	describe("P2003 - foreign key", () => {
		it("should return 400 with VALIDATION_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2003"));

			expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.VALIDATION_ERROR);
			expect(body).toHaveProperty("status", HttpStatus.BAD_REQUEST);
		});
	});

	describe("unknown Prisma error", () => {
		it("should return 500 with INTERNAL_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P9999"));

			expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
			expect(body).toHaveProperty("message", "An unexpected database error occurred.");
			expect(body).toHaveProperty("status", HttpStatus.INTERNAL_SERVER_ERROR);
		});
	});

	describe("metadata fields", () => {
		it("should include request_id, timestamp, endpoint in all responses", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("request_id", expect.any(String));
			expect(body).toHaveProperty("timestamp", expect.any(String));
			expect(body).toHaveProperty("endpoint", "/api/v1/posts");
		});

		it("should pass through X-Request-ID header value", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"), "custom-req-id");

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("request_id", "custom-req-id");
		});

		it("should serialize snake_case keys", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).not.toHaveProperty("errorCode");
			expect(body).not.toHaveProperty("requestId");
			expect(body).toHaveProperty("error_code");
			expect(body).toHaveProperty("request_id");
		});

		it("should format timestamp as ISO 8601", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body["timestamp"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});
});
