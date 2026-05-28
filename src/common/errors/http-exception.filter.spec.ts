import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { ErrorOutputDto } from "./error-output.dto";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost(exception: unknown) {
	const statusMock = vi.fn();
	const sendMock = vi.fn();
	const response = { status: statusMock.mockReturnValue({ send: sendMock }) };
	const request = { method: "GET", url: "/api/v1/test" };

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
	it("should handle DomainError subclass", () => {
		class TestNotFoundError extends HttpException {
			constructor(message: string) {
				super({ error_code: ErrorCode.NOT_FOUND, message }, HttpStatus.NOT_FOUND);
			}
		}

		const { sendMock, statusMock } = createMockHost(new TestNotFoundError("Resource not found"));

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
		expect(sendMock).toHaveBeenCalledWith(expect.any(ErrorOutputDto));

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.NOT_FOUND);
		expect(body.message).toBe("Resource not found");
	});

	it("should handle HttpException with string response", () => {
		const exception = new HttpException("Something went wrong", HttpStatus.BAD_REQUEST);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("Something went wrong");
	});

	it("should handle HttpException with object response containing error_code", () => {
		const exception = new HttpException({ error_code: ErrorCode.RATE_LIMITED, message: "Too many requests" }, HttpStatus.TOO_MANY_REQUESTS);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.RATE_LIMITED);
		expect(body.message).toBe("Too many requests");
	});

	it("should handle HttpException with array message (validation errors)", () => {
		const exception = new HttpException({ message: ["field is required", "field must be a string"] }, HttpStatus.BAD_REQUEST);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("field is required; field must be a string");
	});

	it("should handle non-HttpException Error", () => {
		const { sendMock, statusMock } = createMockHost(new Error("unexpected failure"));

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected error occurred");
	});

	it("should handle unknown throwable (not an Error)", () => {
		const { sendMock, statusMock } = createMockHost("string error");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected error occurred");
	});

	it("should handle null throwable", () => {
		const { sendMock, statusMock } = createMockHost(null);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected error occurred");
	});

	it("should handle object response without error_code key", () => {
		const exception = new HttpException({ message: "some error" }, HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("some error");
	});

	it("should handle HttpException with numeric response (non-string, non-object)", () => {
		const exception = new HttpException(123 as never, HttpStatus.INTERNAL_SERVER_ERROR);

		const { sendMock, statusMock } = createMockHost(exception);

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected error occurred");
	});

	it("should handle object message that is neither string nor array", () => {
		const exception = new HttpException({ message: { key: "value" } } as never, HttpStatus.BAD_REQUEST);

		const { sendMock } = createMockHost(exception);

		const body = sendMock.mock.calls[0]![0] as ErrorOutputDto;
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected error occurred");
	});
});
