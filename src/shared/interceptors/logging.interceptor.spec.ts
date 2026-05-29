import { of } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { LoggingInterceptor } from "./logging.interceptor";

describe("LoggingInterceptor", () => {
	let interceptor: LoggingInterceptor;
	let mockExecutionContext: ExecutionContext;
	let mockRequest: { method: string; url: string };
	let mockResponse: { statusCode: number };

	beforeEach(() => {
		interceptor = new LoggingInterceptor();
		mockRequest = { method: "GET", url: "/v1/posts" };
		mockResponse = { statusCode: 200 };

		mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => mockRequest,
				getResponse: () => mockResponse,
			}),
		} as never;
	});

	it("should log request details on successful response", () => {
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		const mockCallHandler: CallHandler = {
			handle: () => of(undefined),
		};

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		expect(loggerSpy).toHaveBeenCalledTimes(1);
		const logMessage = loggerSpy.mock.calls[0]![0] as string;
		expect(logMessage).toContain("GET");
		expect(logMessage).toContain("/v1/posts");
		expect(logMessage).toContain("200");
	});

	it("should include duration in log message", () => {
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		const mockCallHandler: CallHandler = {
			handle: () => of(undefined),
		};

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		const logMessage = loggerSpy.mock.calls[0]![0] as string;
		expect(logMessage).toMatch(/\d+ms/);
	});

	it("should return observable from next.handle", () => {
		const mockCallHandler: CallHandler = {
			handle: () => of("result"),
		};

		const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

		let emitted: unknown;
		result$.subscribe({ next: (val) => (emitted = val) });
		expect(emitted).toBe("result");
	});

	it("should log different HTTP methods correctly", () => {
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		mockRequest.method = "POST";
		mockRequest.url = "/v1/reports";
		mockResponse.statusCode = 201;

		const mockCallHandler: CallHandler = {
			handle: () => of(undefined),
		};

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		const logMessage = loggerSpy.mock.calls[0]![0] as string;
		expect(logMessage).toContain("POST");
		expect(logMessage).toContain("/v1/reports");
		expect(logMessage).toContain("201");
	});
});
