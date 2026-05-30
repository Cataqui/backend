import { of, lastValueFrom } from "rxjs";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ResponseInterceptor } from "./response.interceptor";
import { PaginatedResponseDto } from "../../shared/dto/paginated-response.dto";
import { PaginationOutputDto } from "../../shared/dto/pagination-output.dto";
import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";

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
		it("should wrap plain object in envelope with data, request_id, timestamp, endpoint", async () => {
			const context = createMockContext({ url: "/v1/posts/123" });
			const handler = createMockHandler({ id: 1, title: "Test" });
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("data", { id: 1, title: "Test" });
			expect(result).toHaveProperty("request_id", expect.any(String));
			expect(result).toHaveProperty("timestamp", expect.any(String));
			expect(result).toHaveProperty("endpoint", "/v1/posts/123");
			expect(result).not.toHaveProperty("pagination");
		});

		it("should use X-Request-ID header when provided", async () => {
			const context = createMockContext({ headers: { "x-request-id": "custom-id" } });
			const handler = createMockHandler({});
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("request_id", "custom-id");
		});

		it("should generate UUID request_id when no header", async () => {
			const context = createMockContext({ headers: {} });
			const handler = createMockHandler({});
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect((result as Record<string, unknown>)["request_id"]).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("should serialize DTO instances with snake_case", async () => {
			class TestDto {
				readonly someField: string;
				readonly anotherField: number;
				constructor(someField: string, anotherField: number) {
					this.someField = someField;
					this.anotherField = anotherField;
				}
			}

			const context = createMockContext();
			const handler = createMockHandler(new TestDto("value", 42));
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("data");
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
		it("should unwrap PaginatedResponseDto into data and pagination", async () => {
			const context = createMockContext({ url: "/v1/feed" });
			const pagination = new PaginationOutputDto(true, "next-cursor");
			const paginatedData = new PaginatedResponseDto([{ id: 1 }, { id: 2 }], pagination);
			const handler = createMockHandler(paginatedData);
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).toHaveProperty("data");
			expect((result as Record<string, unknown>)["data"]).toHaveLength(2);
			expect(result).toHaveProperty("pagination");
			expect(result).toHaveProperty("request_id", expect.any(String));
			expect(result).toHaveProperty("timestamp", expect.any(String));
			expect(result).toHaveProperty("endpoint", "/v1/feed");
		});

		it("should serialize pagination with snake_case keys", async () => {
			const context = createMockContext();
			const pagination = new PaginationOutputDto(true, "cursor-val");
			const paginatedData = new PaginatedResponseDto([], pagination);
			const handler = createMockHandler(paginatedData);
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			const resultPagination = (result as Record<string, unknown>)["pagination"] as Record<string, unknown>;
			expect(resultPagination).toHaveProperty("has_more", true);
			expect(resultPagination).toHaveProperty("next_cursor", "cursor-val");
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

			expect(result).not.toHaveProperty("data");
			expect(result).not.toHaveProperty("request_id");
			expect(result).not.toHaveProperty("timestamp");
			expect(result).not.toHaveProperty("endpoint");
			expect(result).toEqual({ status: "ok", details: { database: { status: "up" } } });
		});

		it("should still serialize DTO instances via instanceToPlain when envelope is skipped", async () => {
			class TestHealthDto {
				readonly someField: string;
				constructor(someField: string) {
					this.someField = someField;
				}
			}

			const handlerFn = (): void => {};
			Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handlerFn);

			const context = createMockContext({}, handlerFn);
			const handler = createMockHandler(new TestHealthDto("value"));
			const interceptor = new ResponseInterceptor();

			const result = await lastValueFrom(interceptor.intercept(context, handler));

			expect(result).not.toHaveProperty("data");
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
