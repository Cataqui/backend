import { HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client.js";
import { ErrorCode } from "../../errors/error-code.enum.js";
import { PrismaExceptionFilter } from "./prisma-exception.filter.js";

const recordRequestException = vi.hoisted(() => vi.fn());

vi.mock("../../observability/http-telemetry.hook", () => ({ recordRequestException: recordRequestException }));

function createMockHost(exception: Prisma.PrismaClientKnownRequestError, requestId?: string) {
	const statusMock = vi.fn();
	const sendMock = vi.fn();
	const response = { status: statusMock.mockReturnValue({ send: sendMock }) };
	const request = {
		method: "GET",
		url: "/v1/posts",
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
		it("should return 404 with NOT_FOUND errorCode", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2025"));

			expect({ httpStatus: statusMock.mock.calls[0]?.[0], body: sendMock.mock.calls[0]?.[0] }).toEqual({
				httpStatus: HttpStatus.NOT_FOUND,
				body: {
					errorCode: ErrorCode.NOT_FOUND,
					message: "The requested record was not found or could not be accessed.",
					status: HttpStatus.NOT_FOUND,
					requestId: expect.any(String),
					timestamp: expect.any(String),
					endpoint: "/v1/posts",
				},
			});
		});
	});

	describe("P2002 - unique constraint", () => {
		it("should return 409 with VALIDATION_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2002"));

			expect({ httpStatus: statusMock.mock.calls[0]?.[0], body: sendMock.mock.calls[0]?.[0] }).toMatchObject({
				httpStatus: HttpStatus.CONFLICT,
				body: { errorCode: ErrorCode.VALIDATION_ERROR, status: HttpStatus.CONFLICT },
			});
		});
	});

	describe("P2003 - foreign key", () => {
		it("should return 400 with VALIDATION_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P2003"));

			expect({ httpStatus: statusMock.mock.calls[0]?.[0], body: sendMock.mock.calls[0]?.[0] }).toMatchObject({
				httpStatus: HttpStatus.BAD_REQUEST,
				body: { errorCode: ErrorCode.VALIDATION_ERROR, status: HttpStatus.BAD_REQUEST },
			});
		});
	});

	describe("unknown Prisma error", () => {
		it("should mark the request trace as failed with the database error", () => {
			recordRequestException.mockClear();
			const error = createMockPrismaError("P9999");

			const { request } = createMockHost(error);

			expect(recordRequestException).toHaveBeenCalledWith(request, error);
		});

		it("should not mark the request trace as failed for mapped client errors", () => {
			recordRequestException.mockClear();

			createMockHost(createMockPrismaError("P2025"));

			expect(recordRequestException).not.toHaveBeenCalled();
		});

		it("should return 500 with INTERNAL_ERROR", () => {
			const { sendMock, statusMock } = createMockHost(createMockPrismaError("P9999"));

			expect({ httpStatus: statusMock.mock.calls[0]?.[0], body: sendMock.mock.calls[0]?.[0] }).toMatchObject({
				httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
				body: {
					errorCode: ErrorCode.INTERNAL_ERROR,
					message: "An unexpected database error occurred.",
					status: HttpStatus.INTERNAL_SERVER_ERROR,
				},
			});
		});
	});

	describe("metadata fields", () => {
		it("should include requestId, timestamp, endpoint in all responses", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toMatchObject({
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/posts",
			});
		});

		it("should pass through X-Request-ID header value", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"), "custom-req-id");

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("requestId", "custom-req-id");
		});

		it("should serialize camelCase keys", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(Object.keys(body)).toEqual(["errorCode", "message", "status", "requestId", "timestamp", "endpoint"]);
		});

		it("should format timestamp as ISO 8601", () => {
			const { sendMock } = createMockHost(createMockPrismaError("P2025"));

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body["timestamp"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});

	describe("metadata sanitization", () => {
		it("should preserve safe target field in logged warning", () => {
			const error = {
				code: "P2002",
				meta: {
					target: ["email"],
					sensitiveValue: "extremely_secret_password_123",
				},
				message: "Prisma error P2002",
				stack: "Error stack",
			} as unknown as Prisma.PrismaClientKnownRequestError;

			const loggerWarnSpy = vi.spyOn(Logger.prototype, "warn");
			createMockHost(error);

			expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('"target":["email"]'));
			loggerWarnSpy.mockRestore();
		});

		it("should scrub sensitiveValue from logged warning", () => {
			const error = {
				code: "P2002",
				meta: {
					target: ["email"],
					sensitiveValue: "extremely_secret_password_123",
				},
				message: "Prisma error P2002",
				stack: "Error stack",
			} as unknown as Prisma.PrismaClientKnownRequestError;

			const loggerWarnSpy = vi.spyOn(Logger.prototype, "warn");
			createMockHost(error);

			expect(loggerWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining("extremely_secret_password_123"));
			loggerWarnSpy.mockRestore();
		});
	});
});
