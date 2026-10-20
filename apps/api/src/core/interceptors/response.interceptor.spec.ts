import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { lastValueFrom, of } from "rxjs";
import * as td from "testdouble";
import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";
import { PaginatedResult } from "../../shared/results/paginated-result";
import { ResponseInterceptor } from "./response.interceptor";

afterEach(() => td.reset());

function _createMockContext(
	params: { request?: Partial<FastifyRequest>; handler?: () => void } = {},
): ExecutionContext {
	const request = Object.assign(td.object<FastifyRequest>(), {
		headers: params.request?.headers ?? {},
		url: params.request?.url ?? "/v1/test",
	});

	const context = td.object<ExecutionContext>();
	const http = td.object<ReturnType<ExecutionContext["switchToHttp"]>>();
	class _Controller {}
	td.when(context.switchToHttp()).thenReturn(http);
	td.when(http.getRequest<FastifyRequest>()).thenReturn(request);
	td.when(context.getHandler()).thenDo((): (() => void) => params.handler ?? td.func<() => void>());
	td.when(context.getClass()).thenReturn(_Controller);
	return context;
}

function _createMockHandler(params: { data: unknown }): CallHandler<unknown> {
	const handler = td.object<CallHandler<unknown>>();
	td.when(handler.handle()).thenReturn(of(params.data));
	return handler;
}

describe("ResponseInterceptor", () => {
	describe("single resource", () => {
		it("should wrap a plain object in the camelCase response envelope", async () => {
			const context = _createMockContext({ request: { url: "/v1/posts/123" } });
			const handler = _createMockHandler({ data: { id: 1, title: "Test" } });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({
				data: { id: 1, title: "Test" },
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/posts/123",
			});
		});

		it("should use X-Request-ID header when provided", async () => {
			const context = _createMockContext({ request: { headers: { "x-request-id": "custom-id" } } });
			const handler = _createMockHandler({ data: {} });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("requestId", "custom-id");
		});

		it("should generate a UUID requestId when no header is provided", async () => {
			const context = _createMockContext({ request: { headers: {} } });
			const handler = _createMockHandler({ data: {} });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect((result as Record<string, unknown>)["requestId"]).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("should preserve camelCase output properties", async () => {
			const context = _createMockContext();
			const handler = _createMockHandler({ data: { someField: "value", anotherField: 42 } });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect((result as Record<string, unknown>)["data"]).toEqual({ someField: "value", anotherField: 42 });
		});

		it("should handle null data", async () => {
			const context = _createMockContext();
			const handler = _createMockHandler({ data: null });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeNull();
		});

		it("should handle undefined data", async () => {
			const context = _createMockContext();
			const handler = _createMockHandler({ data: undefined });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeUndefined();
		});

		it("should handle primitive data", async () => {
			const context = _createMockContext();
			const handler = _createMockHandler({ data: "plain-string" });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("data", "plain-string");
		});

		it("should format timestamp as ISO 8601", async () => {
			const context = _createMockContext();
			const handler = _createMockHandler({ data: {} });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			const timestamp = (result as Record<string, unknown>)["timestamp"] as string;
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});

	describe("paginated response", () => {
		it("should unwrap a paginated result into data and pagination", async () => {
			const context = _createMockContext({ request: { url: "/v1/feed" } });
			const paginatedData = PaginatedResult.create({
				data: [{ id: 1 }, { id: 2 }],
				pagination: { hasMore: true, nextCursor: "next-cursor" },
			});
			const handler = _createMockHandler({ data: paginatedData });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({
				data: [{ id: 1 }, { id: 2 }],
				pagination: { hasMore: true, nextCursor: "next-cursor" },
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/feed",
			});
		});

		it("should serialize pagination with camelCase keys", async () => {
			const context = _createMockContext();
			const paginatedData = PaginatedResult.create({
				data: [],
				pagination: { hasMore: true, nextCursor: "cursor-val" },
			});
			const handler = _createMockHandler({ data: paginatedData });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			const resultPagination = (result as Record<string, unknown>)["pagination"] as Record<string, unknown>;
			expect(resultPagination).toEqual({ hasMore: true, nextCursor: "cursor-val" });
		});
	});

	describe("skip envelope", () => {
		it("should skip envelope when @SkipEnvelope decorator is present on handler", async () => {
			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = _createMockContext({ request: { url: "/v1/health" }, handler: handlerFn });
			const handler = _createMockHandler({ data: { status: "ok", details: { database: { status: "up" } } } });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({ status: "ok", details: { database: { status: "up" } } });
		});

		it("should preserve output objects when the envelope is skipped", async () => {
			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = _createMockContext({ request: {}, handler: handlerFn });
			const handler = _createMockHandler({ data: { someField: "value" } });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({ someField: "value" });
		});

		it("should handle null data when envelope is skipped", async () => {
			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = _createMockContext({ request: {}, handler: handlerFn });
			const handler = _createMockHandler({ data: null });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeNull();
		});
	});
});
