import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { lastValueFrom, of } from "rxjs";
import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";
import { PaginatedResult } from "../../shared/results/paginated-result";
import { ResponseInterceptor } from "./response.interceptor";

function createMockContext(requestOverrides: Partial<FastifyRequest> = {}, handler?: () => void): ExecutionContext {
	const request = {
		headers: {},
		url: "/v1/test",
		...requestOverrides,
	} as FastifyRequest;

	const handlerFn = handler ?? (() => ({}));

	return {
		switchToHttp: () => ({
			getRequest: () => request,
		}),
		getHandler: () => handlerFn,
		getClass: () => ({}),
	} as unknown as ExecutionContext;
}

function createMockHandler(data: unknown): CallHandler {
	return {
		handle: () => of(data),
	} as CallHandler;
}

describe("ResponseInterceptor", () => {
	describe("single resource", () => {
		it("should wrap a plain object in the camelCase response envelope", async () => {
			const context = createMockContext({ url: "/v1/posts/123" });
			const handler = createMockHandler({ id: 1, title: "Test" });
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
			const context = createMockContext({ headers: { "x-request-id": "custom-id" } });
			const handler = createMockHandler({});
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("requestId", "custom-id");
		});

		it("should generate a UUID requestId when no header is provided", async () => {
			const context = createMockContext({ headers: {} });
			const handler = createMockHandler({});
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect((result as Record<string, unknown>)["requestId"]).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("should preserve camelCase output properties", async () => {
			const context = createMockContext();
			const handler = createMockHandler({ someField: "value", anotherField: 42 });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect((result as Record<string, unknown>)["data"]).toEqual({ someField: "value", anotherField: 42 });
		});

		it("should handle null data", async () => {
			const context = createMockContext();
			const handler = createMockHandler(null);
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeNull();
		});

		it("should handle undefined data", async () => {
			const context = createMockContext();
			const handler = createMockHandler(undefined);
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeUndefined();
		});

		it("should handle primitive data", async () => {
			const context = createMockContext();
			const handler = createMockHandler("plain-string");
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("data", "plain-string");
		});

		it("should format timestamp as ISO 8601", async () => {
			const context = createMockContext();
			const handler = createMockHandler({});
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			const timestamp = (result as Record<string, unknown>)["timestamp"] as string;
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});

	describe("paginated response", () => {
		it("should unwrap a paginated result into data and pagination", async () => {
			const context = createMockContext({ url: "/v1/feed" });
			const paginatedData = PaginatedResult.create({
				data: [{ id: 1 }, { id: 2 }],
				pagination: { hasMore: true, nextCursor: "next-cursor" },
			});
			const handler = createMockHandler(paginatedData);
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
			const context = createMockContext();
			const paginatedData = PaginatedResult.create({
				data: [],
				pagination: { hasMore: true, nextCursor: "cursor-val" },
			});
			const handler = createMockHandler(paginatedData);
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

			const context = createMockContext({ url: "/v1/health" }, handlerFn);
			const handler = createMockHandler({ status: "ok", details: { database: { status: "up" } } });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({ status: "ok", details: { database: { status: "up" } } });
		});

		it("should preserve output objects when the envelope is skipped", async () => {
			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = createMockContext({}, handlerFn);
			const handler = createMockHandler({ someField: "value" });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toEqual({ someField: "value" });
		});

		it("should handle null data when envelope is skipped", async () => {
			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = createMockContext({}, handlerFn);
			const handler = createMockHandler(null);
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toBeNull();
		});
	});
});
