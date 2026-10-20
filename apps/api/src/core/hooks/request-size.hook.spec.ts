import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as td from "testdouble";
import { requestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { registerRequestSizeHooks } from "./request-size.hook";

afterEach(() => td.reset());

const config = requestSizeConfig();

function _createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
	return Object.assign(td.object<FastifyRequest>(), {
		headers: overrides.headers ?? {},
		url: overrides.url ?? "/v1/test",
		method: overrides.method ?? "GET",
	});
}

describe("registerRequestSizeHooks", () => {
	it("should register an onRequest hook", () => {
		const app = td.object<FastifyInstance>();

		registerRequestSizeHooks(app, config);

		td.verify(app.addHook("onRequest", td.matchers.isA(Function)));
	});

	describe("Content-Length check", () => {
		it("should allow request when Content-Length is within limit", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes) },
			});

			await hook(request, reply);

			expect({
				codeCalls: td.explain(reply.code).calls.length,
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should reject when Content-Length exceeds limit", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			expect({
				status: td.explain(reply.code).calls[0]?.args[0],
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				status: 413,
				sendCalls: 1,
			});
		});

		it("should return envelope with PAYLOAD_TOO_LARGE errorCode for oversized body", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			const body = td.explain(reply.send).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toEqual({
				errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
				message: "Request body exceeds the maximum allowed size.",
				status: 413,
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: "/v1/test",
			});
		});

		it("should allow request when Content-Length is missing", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest();

			await hook(request, reply);

			expect({
				codeCalls: td.explain(reply.code).calls.length,
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should allow request when Content-Length is non-numeric", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({
				headers: { "content-length": "not-a-number" },
			});

			await hook(request, reply);

			expect({
				codeCalls: td.explain(reply.code).calls.length,
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});
	});

	describe("URL length check", () => {
		it("should allow request when URL is within limit", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({ url: "/v1/within-limit" });

			await hook(request, reply);

			expect({
				codeCalls: td.explain(reply.code).calls.length,
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should reject when URL exceeds limit", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = _createMockRequest({ url: longUrl });

			await hook(request, reply);

			expect({
				status: td.explain(reply.code).calls[0]?.args[0],
				sendCalls: td.explain(reply.send).calls.length,
			}).toEqual({
				status: 414,
				sendCalls: 1,
			});
		});

		it("should return envelope with URI_TOO_LONG errorCode for long URL", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = _createMockRequest({ url: longUrl });

			await hook(request, reply);

			const body = td.explain(reply.send).calls[0]!.args[0] as Record<string, unknown>;
			expect(body).toEqual({
				errorCode: ErrorCode.URI_TOO_LONG,
				message: "Request URL exceeds the maximum allowed length.",
				status: 414,
				requestId: expect.any(String),
				timestamp: expect.any(String),
				endpoint: longUrl,
			});
		});
	});

	describe("check ordering", () => {
		it("should check Content-Length before URL length", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = _createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
				url: longUrl,
			});

			await hook(request, reply);

			expect(td.explain(reply.code).calls.map((call) => call.args[0])).toEqual([413]);
		});
	});

	describe("serialization", () => {
		it("should expose camelCase keys directly from the Zod output schema", async () => {
			const app = td.object<FastifyInstance>();
			registerRequestSizeHooks(app, config);

			const hook = td.explain(app.addHook).calls[0]!.args[1] as (
				request: FastifyRequest,
				reply: FastifyReply,
			) => Promise<void>;
			const reply = td.object<FastifyReply>();
			td.when(reply.code(td.matchers.anything())).thenReturn(reply);
			const request = _createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			const body = td.explain(reply.send).calls[0]!.args[0] as Record<string, unknown>;
			expect(Object.keys(body)).toEqual(["errorCode", "message", "status", "requestId", "timestamp", "endpoint"]);
		});
	});
});
