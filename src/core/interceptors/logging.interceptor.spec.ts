import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";
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

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect({
			calls: loggerSpy.mock.calls.length,
			method: logMessage.includes("GET"),
			endpoint: logMessage.includes("/v1/posts"),
			status: logMessage.includes("200"),
		}).toEqual({ calls: 1, method: true, endpoint: true, status: true });
	});

	it("should include duration in log message", () => {
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		const mockCallHandler: CallHandler = {
			handle: () => of(undefined),
		};

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect(logMessage).toMatch(/\d+ms/);
	});

	it("should exclude query values from request logs", () => {
		const loggerSpy = vi.spyOn(interceptor["_logger"], "log");
		mockRequest.url = "/v1/feed?cursor=secret-token";

		interceptor.intercept(mockExecutionContext, { handle: () => of(undefined) }).subscribe();

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect({
			includesEndpoint: logMessage.includes("/v1/feed"),
			includesSecret: logMessage.includes("secret-token"),
		}).toEqual({
			includesEndpoint: true,
			includesSecret: false,
		});
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

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect({
			method: logMessage.includes("POST"),
			endpoint: logMessage.includes("/v1/reports"),
			status: logMessage.includes("201"),
		}).toEqual({ method: true, endpoint: true, status: true });
	});
});
