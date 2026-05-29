import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../error-code.enum";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost(exception: unknown, requestId?: string) {
	const statusMock = vi.fn();
	const sendMock = vi.fn();
	const response = { status: statusMock.mockReturnValue({ send: sendMock }) };
	const request = {
		method: "GET",
		url: "/api/v1/test",
		headers: requestId ? { "x-request-id": requestId } : {},
	};

	const host = {
		switchToHttp: () => ({
			getResponse: () => response,
			getRequest: () => request,
		}),
	};

	const filter = new HttpExceptionFilter();
	filter.catch(exception, host as never);

	return { statusMock, sendMock, response, request };
}

describe("HttpExceptionFilter", () => {
	it("should handle DomainError subclass with snake_case and metadata", () => {
		class TestNotFoundError extends HttpException {
			constructor(message: string) {
				super({ error_code: ErrorCode.NOT_FOUND, message }, HttpStatus.NOT_FOUND);
			}
		}

		const { sendMock, statusMock } = createMockHost(new TestNotFoundError("Resource not found"));

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.NOT_FOUND);
		expect(body).toHaveProperty("message", "Resource not found");
		expect(body).toHaveProperty("status", HttpStatus.NOT_FOUND);
		expect(body).toHaveProperty("request_id", expect.any(String));
		expect(body).toHaveProperty("timestamp", expect.any(String));
		expect(body).toHaveProperty("endpoint", "/api/v1/test");
		expect(body).not.toHaveProperty("errorCode");
	});

	it("should handle HttpException with string response", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "Something went wrong");
		expect(body).toHaveProperty("status", HttpStatus.BAD_REQUEST);
		expect(body).toHaveProperty("request_id", expect.any(String));
		expect(body).toHaveProperty("timestamp", expect.any(String));
		expect(body).toHaveProperty("endpoint", "/api/v1/test");
	});

	it("should handle HttpException with object response containing error_code", () => {
		const exception = new HttpException({ error_code: ErrorCode.RATE_LIMITED, message: "Too many requests" }, HttpStatus.TOO_MANY_REQUESTS);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.RATE_LIMITED);
		expect(body).toHaveProperty("message", "Too many requests");
		expect(body).toHaveProperty("status", HttpStatus.TOO_MANY_REQUESTS);
	});

	it("should handle HttpException with array message (validation errors)", () => {
		const exception = new HttpException({ message: ["field is required", "field must be a string"] }, HttpStatus.BAD_REQUEST);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "field is required; field must be a string");
	});

	it("should handle non-HttpException Error", () => {
		const { sendMock, statusMock } = createMockHost(new Error("unexpected failure"));

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "An unexpected error occurred");
	});

	it("should handle unknown throwable (not an Error)", () => {
		const { sendMock, statusMock } = createMockHost("string error");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "An unexpected error occurred");
	});

	it("should handle null throwable", () => {
		const { sendMock, statusMock } = createMockHost(null);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "An unexpected error occurred");
	});

	it("should handle object response without error_code key", () => {
		const exception = new HttpException({ message: "some error" }, HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "some error");
	});

	it("should handle HttpException with numeric response (non-string, non-object)", () => {
		const exception = new HttpException(123 as never, HttpStatus.INTERNAL_SERVER_ERROR);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "An unexpected error occurred");
	});

	it("should handle object message that is neither string nor array", () => {
		const exception = new HttpException({ message: { key: "value" } } as never, HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("error_code", ErrorCode.INTERNAL_ERROR);
		expect(body).toHaveProperty("message", "An unexpected error occurred");
	});

	it("should pass through X-Request-ID header value", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception, "custom-request-id-from-header");

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body).toHaveProperty("request_id", "custom-request-id-from-header");
	});

	it("should generate a UUID request_id when no X-Request-ID header", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body["request_id"] as string).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("should format timestamp as ISO 8601", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
		expect(body["timestamp"] as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	describe("route not found", () => {
		it("should return ROUTE_NOT_FOUND when ExceptionMessage starts with Cannot and status is 404", () => {
			const exception = new HttpException({ message: "Cannot GET /api/v1/nonexistent", statusCode: 404, error: "Not Found" }, HttpStatus.NOT_FOUND);

			const { sendMock, statusMock } = createMockHost(exception);

			expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.ROUTE_NOT_FOUND);
			expect(body).toHaveProperty("message", "The requested endpoint was not found.");
			expect(body).toHaveProperty("status", HttpStatus.NOT_FOUND);
		});

		it("should return NOT_FOUND for NotFoundException without Cannot prefix", () => {
			const exception = new HttpException({ message: "Custom not found", statusCode: 404 }, HttpStatus.NOT_FOUND);

			const { sendMock } = createMockHost(exception);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.NOT_FOUND);
			expect(body).toHaveProperty("message", "Custom not found");
		});

		it("should return ROUTE_NOT_FOUND with string response starting with Cannot", () => {
			const exception = new HttpException("Cannot GET /api/v1/unknown", HttpStatus.NOT_FOUND);

			const { sendMock } = createMockHost(exception);

			const body = sendMock.mock.calls[0]![0] as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", ErrorCode.ROUTE_NOT_FOUND);
			expect(body).toHaveProperty("message", "The requested endpoint was not found.");
		});
	});
});
