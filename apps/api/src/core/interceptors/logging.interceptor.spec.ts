import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { of } from "rxjs";
import * as td from "testdouble";
import { LoggingInterceptor } from "./logging.interceptor";

afterEach(() => td.reset());

describe("LoggingInterceptor", () => {
	let interceptor: LoggingInterceptor;
	let mockExecutionContext: ExecutionContext;
	let mockRequest: FastifyRequest;
	let mockResponse: FastifyReply;

	beforeEach(() => {
		interceptor = new LoggingInterceptor();

		mockExecutionContext = td.object<ExecutionContext>();
		mockRequest = td.object<FastifyRequest>();
		mockResponse = td.object<FastifyReply>();
		const http = td.object<ReturnType<ExecutionContext["switchToHttp"]>>();
		td.when(mockExecutionContext.switchToHttp()).thenReturn(http);
		td.when(http.getRequest<FastifyRequest>()).thenReturn(mockRequest);
		td.when(http.getResponse<FastifyReply>()).thenReturn(mockResponse);
	});

	it("should log request details on successful response", () => {
		Object.assign(mockRequest, { method: "GET", url: "/v1/posts" });
		mockResponse.statusCode = 200;
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		const mockCallHandler = td.object<CallHandler<unknown>>();
		td.when(mockCallHandler.handle()).thenReturn(of(undefined));

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
		Object.assign(mockRequest, { method: "GET", url: "/v1/posts" });
		mockResponse.statusCode = 200;
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		const mockCallHandler = td.object<CallHandler<unknown>>();
		td.when(mockCallHandler.handle()).thenReturn(of(undefined));

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect(logMessage).toMatch(/\d+ms/);
	});

	it("should exclude query values from request logs", () => {
		Object.assign(mockRequest, { method: "GET", url: "/v1/posts" });
		mockResponse.statusCode = 200;
		const loggerSpy = vi.spyOn(interceptor["_logger"], "log");
		Object.assign(mockRequest, { url: "/v1/feed?cursor=secret-token" });

		const handler = td.object<CallHandler<unknown>>();
		td.when(handler.handle()).thenReturn(of(undefined));

		interceptor.intercept(mockExecutionContext, handler).subscribe();

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
		Object.assign(mockRequest, { method: "GET", url: "/v1/posts" });
		mockResponse.statusCode = 200;
		const mockCallHandler = td.object<CallHandler<unknown>>();
		td.when(mockCallHandler.handle()).thenReturn(of("result"));

		const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

		const next = td.func<(value: unknown) => void>();
		result$.subscribe({ next: next });
		td.verify(next("result"));
	});

	it("should log different HTTP methods correctly", () => {
		Object.assign(mockRequest, { method: "GET", url: "/v1/posts" });
		mockResponse.statusCode = 200;
		const logger = interceptor["_logger"];
		const loggerSpy = vi.spyOn(logger, "log");
		Object.assign(mockRequest, { method: "POST", url: "/v1/reports" });
		mockResponse.statusCode = 201;

		const mockCallHandler = td.object<CallHandler<unknown>>();
		td.when(mockCallHandler.handle()).thenReturn(of(undefined));

		interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe();

		const logMessage = String(loggerSpy.mock.calls[0]?.[0]);
		expect({
			method: logMessage.includes("POST"),
			endpoint: logMessage.includes("/v1/reports"),
			status: logMessage.includes("201"),
		}).toEqual({ method: true, endpoint: true, status: true });
	});
});
