import { type ArgumentsHost, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as td from "testdouble";
import { Prisma } from "../../../../generated/prisma/client";
import { ErrorCode } from "../../errors/error-code.enum";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

afterEach(() => td.reset());

function _createMockHost(
	exception: Prisma.PrismaClientKnownRequestError,
	requestId?: string,
): {
	statusMock: FastifyReply["status"];
	sendMock: FastifyReply["send"];
	response: FastifyReply;
	request: FastifyRequest;
} {
	const response = td.object<FastifyReply>();
	const statusMock = response.status;
	const sendMock = response.send;
	td.when(response.status(td.matchers.anything())).thenReturn(response);
	const request = Object.assign(td.object<FastifyRequest>(), {
		method: "GET",
		url: "/v1/posts",
		headers: requestId ? { "x-request-id": requestId } : {},
	});
	const httpHost = td.object<ReturnType<ArgumentsHost["switchToHttp"]>>();
	td.when(httpHost.getResponse<FastifyReply>()).thenReturn(response);
	td.when(httpHost.getRequest<FastifyRequest>()).thenReturn(request);
	const host = td.object<ArgumentsHost>();
	td.when(host.switchToHttp()).thenReturn(httpHost);

	const filter = new PrismaExceptionFilter();
	filter.catch(exception, host);

	return { statusMock: statusMock, sendMock: sendMock, response: response, request: request };
}

function _createPrismaError(code: string): Prisma.PrismaClientKnownRequestError {
	return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
		code: code,
		clientVersion: "test",
		meta: {},
	});
}

describe("PrismaExceptionFilter", () => {
	describe("P2025 - not found", () => {
		it("should return 404 with NOT_FOUND errorCode", () => {
			const { sendMock, statusMock } = _createMockHost(_createPrismaError("P2025"));

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toEqual({
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
			const { sendMock, statusMock } = _createMockHost(_createPrismaError("P2002"));

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.CONFLICT,
				body: { errorCode: ErrorCode.VALIDATION_ERROR, status: HttpStatus.CONFLICT },
			});
		});
	});

	describe("P2003 - foreign key", () => {
		it("should return 400 with VALIDATION_ERROR", () => {
			const { sendMock, statusMock } = _createMockHost(_createPrismaError("P2003"));

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.BAD_REQUEST,
				body: { errorCode: ErrorCode.VALIDATION_ERROR, status: HttpStatus.BAD_REQUEST },
			});
		});
	});

	describe("unknown Prisma error", () => {
		it("should return 500 with INTERNAL_ERROR", () => {
			const { sendMock, statusMock } = _createMockHost(_createPrismaError("P9999"));

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
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
			const { sendMock } = _createMockHost(_createPrismaError("P2025"));

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/posts",
			});
		});

		it("should pass through X-Request-ID header value", () => {
			const { sendMock } = _createMockHost(_createPrismaError("P2025"), "custom-req-id");

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toHaveProperty("requestId", "custom-req-id");
		});

		it("should serialize camelCase keys", () => {
			const { sendMock } = _createMockHost(_createPrismaError("P2025"));

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(Object.keys(body)).toEqual(["errorCode", "message", "status", "requestId", "timestamp", "endpoint"]);
		});

		it("should format timestamp as ISO 8601", () => {
			const { sendMock } = _createMockHost(_createPrismaError("P2025"));

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body["timestamp"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});

	describe("metadata sanitization", () => {
		it("should preserve safe target field in logged warning", () => {
			const error = new Prisma.PrismaClientKnownRequestError("Prisma error P2002", {
				code: "P2002",
				clientVersion: "test",
				meta: {
					target: ["email"],
					sensitiveValue: "extremely_secret_password_123",
				},
			});

			const loggerWarnSpy = vi.spyOn(Logger.prototype, "warn");
			_createMockHost(error);

			expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('"target":["email"]'));
			loggerWarnSpy.mockRestore();
		});

		it("should scrub sensitiveValue from logged warning", () => {
			const error = new Prisma.PrismaClientKnownRequestError("Prisma error P2002", {
				code: "P2002",
				clientVersion: "test",
				meta: {
					target: ["email"],
					sensitiveValue: "extremely_secret_password_123",
				},
			});

			const loggerWarnSpy = vi.spyOn(Logger.prototype, "warn");
			_createMockHost(error);

			expect(loggerWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining("extremely_secret_password_123"));
			loggerWarnSpy.mockRestore();
		});
	});
});
