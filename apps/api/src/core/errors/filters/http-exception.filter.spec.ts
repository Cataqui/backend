import { type ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as td from "testdouble";
import { ErrorCode } from "../error-code.enum";
import { RequestValidationError } from "../request-validation.error";
import { HttpExceptionFilter } from "./http-exception.filter";

afterEach(() => td.reset());

function _createMockHost(params: { exception: unknown; requestId?: string }): {
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
		url: "/v1/test",
		headers: params.requestId ? { "x-request-id": params.requestId } : {},
	});
	const httpHost = td.object<ReturnType<ArgumentsHost["switchToHttp"]>>();
	td.when(httpHost.getResponse<FastifyReply>()).thenReturn(response);
	td.when(httpHost.getRequest<FastifyRequest>()).thenReturn(request);
	const host = td.object<ArgumentsHost>();
	td.when(host.switchToHttp()).thenReturn(httpHost);

	const filter = new HttpExceptionFilter();
	filter.catch(params.exception, host);

	return { statusMock: statusMock, sendMock: sendMock, response: response, request: request };
}

describe("HttpExceptionFilter", () => {
	it("should handle AppError subclass with camelCase and metadata", () => {
		class TestNotFoundError extends HttpException {
			constructor(message: string) {
				super({ errorCode: ErrorCode.NOT_FOUND, message: message }, HttpStatus.NOT_FOUND);
			}
		}

		const { sendMock, statusMock } = _createMockHost({ exception: new TestNotFoundError("Resource not found") });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toEqual({
			httpStatus: HttpStatus.NOT_FOUND,
			body: {
				errorCode: ErrorCode.NOT_FOUND,
				message: "Resource not found",
				status: HttpStatus.NOT_FOUND,
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/test",
			},
		});
	});

	it("should handle HttpException with string response", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toEqual({
			httpStatus: HttpStatus.BAD_REQUEST,
			body: {
				errorCode: ErrorCode.INVALID_REQUEST,
				message: "Something went wrong",
				status: HttpStatus.BAD_REQUEST,
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/test",
			},
		});
	});

	it("should handle HttpException with array message (validation errors)", () => {
		const exception = new HttpException(
			{ message: ["field is required", "field must be a string"] },
			HttpStatus.BAD_REQUEST,
		);

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.BAD_REQUEST,
			body: {
				errorCode: ErrorCode.INVALID_REQUEST,
				message: "field is required; field must be a string",
			},
		});
	});

	it("should preserve structured request validation violations", () => {
		const exception = new RequestValidationError({
			violations: [
				{ path: ["payment", "minAmount"], message: "must be greater than 0" },
				{ path: ["contacts", 0, "identifier"], message: "must be a phone number" },
			],
		});

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.BAD_REQUEST,
			body: {
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				violations: [
					{ path: ["payment", "minAmount"], message: "must be greater than 0" },
					{ path: ["contacts", 0, "identifier"], message: "must be a phone number" },
				],
			},
		});
	});

	it("should omit validation violations containing provider-specific metadata", () => {
		const exception = new HttpException(
			{
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				violations: [{ path: ["channel"], message: "must be supported", code: "invalid_value" }],
			},
			HttpStatus.BAD_REQUEST,
		);

		const { sendMock } = _createMockHost({ exception: exception });

		expect(td.explain(sendMock).calls[0]?.args[0]).toEqual({
			errorCode: ErrorCode.VALIDATION_ERROR,
			message: "The request contains invalid fields.",
			status: HttpStatus.BAD_REQUEST,
			requestId: expect.any(String),
			timestamp: expect.any(String),
			endpoint: "/v1/test",
		});
	});

	it("should handle HttpException with object response containing errorCode", () => {
		const exception = new HttpException(
			{ errorCode: ErrorCode.CORS_BLOCKED, message: "Origin is not allowed" },
			HttpStatus.FORBIDDEN,
		);

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.FORBIDDEN,
			body: {
				errorCode: ErrorCode.CORS_BLOCKED,
				message: "Origin is not allowed",
				status: HttpStatus.FORBIDDEN,
			},
		});
	});

	it("should handle HttpException with array message (validation errors)", () => {
		const exception = new HttpException(
			{ message: ["field is required", "field must be a string"] },
			HttpStatus.BAD_REQUEST,
		);

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.BAD_REQUEST,
			body: {
				errorCode: ErrorCode.INVALID_REQUEST,
				message: "field is required; field must be a string",
			},
		});
	});

	it("should preserve camelCase field names in validation error messages", () => {
		const exception = new HttpException(
			{
				message: [
					"customerId must be a UUID",
					"contact.phoneNumber must be a valid phone number",
					"minAmount must be a positive number",
				],
			},
			HttpStatus.BAD_REQUEST,
		);

		const { sendMock } = _createMockHost({ exception: exception });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body).toMatchObject({
			errorCode: ErrorCode.INVALID_REQUEST,
			message:
				"customerId must be a UUID; contact.phoneNumber must be a valid phone number; minAmount must be a positive number",
		});
	});

	it("should handle non-HttpException Error", () => {
		const { sendMock, statusMock } = _createMockHost({ exception: new Error("unexpected failure") });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
			body: { errorCode: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" },
		});
	});

	it("should handle unknown throwable (not an Error)", () => {
		const { sendMock, statusMock } = _createMockHost({ exception: "string error" });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
			body: { errorCode: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" },
		});
	});

	it("should handle null throwable", () => {
		const { sendMock, statusMock } = _createMockHost({ exception: null });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
			body: { errorCode: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" },
		});
	});

	it("should handle object response without errorCode key", () => {
		const exception = new HttpException({ message: "some error" }, HttpStatus.BAD_REQUEST);

		const { sendMock } = _createMockHost({ exception: exception });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body).toMatchObject({ errorCode: ErrorCode.INVALID_REQUEST, message: "some error" });
	});

	it("should handle HttpException with numeric response (non-string, non-object)", () => {
		const exception = new HttpException(123 as never, HttpStatus.INTERNAL_SERVER_ERROR);

		const { sendMock, statusMock } = _createMockHost({ exception: exception });

		expect({
			httpStatus: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toMatchObject({
			httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
			body: { errorCode: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" },
		});
	});

	it("should handle object message that is neither string nor array", () => {
		const exception = new HttpException({ message: { key: "value" } } as never, HttpStatus.BAD_REQUEST);

		const { sendMock } = _createMockHost({ exception: exception });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body).toMatchObject({
			errorCode: ErrorCode.INVALID_REQUEST,
			message: "An unexpected error occurred",
		});
	});

	it("should pass through X-Request-ID header value", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = _createMockHost({ exception: exception, requestId: "custom-request-id-from-header" });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body).toHaveProperty("requestId", "custom-request-id-from-header");
	});

	it("should generate a UUID requestId when no X-Request-ID header", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = _createMockHost({ exception: exception });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body["requestId"] as string).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("should format timestamp as ISO 8601", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = _createMockHost({ exception: exception });

		const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
		expect(body["timestamp"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	describe("size limit errors", () => {
		it("should return PAYLOAD_TOO_LARGE for string response with 413 status", () => {
			const exception = new HttpException("Request body is too large", HttpStatus.PAYLOAD_TOO_LARGE);

			const { sendMock, statusMock } = _createMockHost({ exception: exception });

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.PAYLOAD_TOO_LARGE,
				body: {
					errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
					message: "Request body exceeds the maximum allowed size.",
					status: HttpStatus.PAYLOAD_TOO_LARGE,
				},
			});
		});

		it("should return PAYLOAD_TOO_LARGE for object response without errorCode with 413 status", () => {
			const exception = new HttpException({ message: "body too big" }, HttpStatus.PAYLOAD_TOO_LARGE);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({ errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: "body too big" });
		});

		it("should return URI_TOO_LONG for string response with 414 status", () => {
			const exception = new HttpException("Request URL is too long", HttpStatus.URI_TOO_LONG);

			const { sendMock, statusMock } = _createMockHost({ exception: exception });

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.URI_TOO_LONG,
				body: {
					errorCode: ErrorCode.URI_TOO_LONG,
					message: "Request URL exceeds the maximum allowed length.",
					status: HttpStatus.URI_TOO_LONG,
				},
			});
		});

		it("should return URI_TOO_LONG for object response without errorCode with 414 status", () => {
			const exception = new HttpException({ message: "url too long" }, HttpStatus.URI_TOO_LONG);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({ errorCode: ErrorCode.URI_TOO_LONG, message: "url too long" });
		});

		it("should return REQUEST_HEADER_FIELDS_TOO_LARGE for string response with 431 status", () => {
			const exception = new HttpException("Request header fields too large", 431);

			const { sendMock, statusMock } = _createMockHost({ exception: exception });

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: 431,
				body: {
					errorCode: ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
					message: "Request header fields exceed the maximum allowed size.",
					status: 431,
				},
			});
		});

		it("should return REQUEST_HEADER_FIELDS_TOO_LARGE for object response without errorCode with 431 status", () => {
			const exception = new HttpException({ message: "headers too big" }, 431);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({
				errorCode: ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
				message: "headers too big",
			});
		});

		it("should pass through custom errorCode from PayloadTooLargeError", () => {
			const exception = new HttpException(
				{ errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: "custom body too large" },
				HttpStatus.PAYLOAD_TOO_LARGE,
			);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({
				errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
				message: "custom body too large",
			});
		});
	});

	describe("unsupported request media types", () => {
		it("should return UNSUPPORTED_MEDIA_TYPE for a string response with 415 status", () => {
			const exception = new HttpException("Unsupported Media Type", HttpStatus.UNSUPPORTED_MEDIA_TYPE);

			const { sendMock, statusMock } = _createMockHost({ exception: exception });

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
				body: {
					errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
					message:
						"Request body media type is unsupported. Send Content-Type: application/json for a JSON body, or omit Content-Type when the request has no body.",
					status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
				},
			});
		});

		it("should return UNSUPPORTED_MEDIA_TYPE for an object response with 415 status", () => {
			const exception = new HttpException({ message: "Unsupported Media Type" }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);

			const { sendMock } = _createMockHost({ exception: exception });

			expect(td.explain(sendMock).calls[0]?.args[0]).toMatchObject({
				errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
				message:
					"Request body media type is unsupported. Send Content-Type: application/json for a JSON body, or omit Content-Type when the request has no body.",
				status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
			});
		});
	});

	describe("route not found", () => {
		it("should return ROUTE_NOT_FOUND when ExceptionMessage starts with Cannot and status is 404", () => {
			const exception = new HttpException(
				{ message: "Cannot GET /v1/nonexistent", statusCode: 404, error: "Not Found" },
				HttpStatus.NOT_FOUND,
			);

			const { sendMock, statusMock } = _createMockHost({ exception: exception });

			expect({
				httpStatus: td.explain(statusMock).calls[0]?.args[0],
				body: td.explain(sendMock).calls[0]?.args[0],
			}).toMatchObject({
				httpStatus: HttpStatus.NOT_FOUND,
				body: {
					errorCode: ErrorCode.ROUTE_NOT_FOUND,
					message: "The requested endpoint was not found.",
					status: HttpStatus.NOT_FOUND,
				},
			});
		});

		it("should return NOT_FOUND for NotFoundException without Cannot prefix", () => {
			const exception = new HttpException({ message: "Custom not found", statusCode: 404 }, HttpStatus.NOT_FOUND);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({ errorCode: ErrorCode.NOT_FOUND, message: "Custom not found" });
		});

		it("should return ROUTE_NOT_FOUND with string response starting with Cannot", () => {
			const exception = new HttpException("Cannot GET /v1/unknown", HttpStatus.NOT_FOUND);

			const { sendMock } = _createMockHost({ exception: exception });

			const body = td.explain(sendMock).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toMatchObject({
				errorCode: ErrorCode.ROUTE_NOT_FOUND,
				message: "The requested endpoint was not found.",
			});
		});
	});
});

it.each(["UNREGISTERED_FAILURE", "", 123, null])(
	"sanitizes unrecognized error code %s without failing error serialization",
	(errorCode) => {
		const { statusMock, sendMock } = _createMockHost({
			exception: new HttpException({ errorCode: errorCode, message: "private provider details" }, 503),
		});

		expect({
			status: td.explain(statusMock).calls[0]?.args[0],
			body: td.explain(sendMock).calls[0]?.args[0],
		}).toEqual({
			status: 503,
			body: {
				errorCode: ErrorCode.INTERNAL_ERROR,
				message: "An unexpected error occurred",
				status: 503,
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/test",
			},
		});
	},
);
