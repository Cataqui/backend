import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { registerRequestSizeHooks } from "./request-size.hook";

const config = requestSizeConfig();

function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
	return {
		headers: {},
		url: "/v1/test",
		method: "GET",
		...overrides,
	} as FastifyRequest;
}

describe("registerRequestSizeHooks", () => {
	it("should register an onRequest hook", () => {
		const addHook = vi.fn();
		const app = { addHook } as unknown as FastifyInstance;

		registerRequestSizeHooks(app, config);

		expect(addHook).toHaveBeenCalledWith("onRequest", expect.any(Function));
	});

	describe("Content-Length check", () => {
		it("should allow request when Content-Length is within limit", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes) },
			});

			await hook(request, reply);

			expect({ codeCalls: code.mock.calls.length, sendCalls: send.mock.calls.length }).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should reject when Content-Length exceeds limit", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			expect({ status: code.mock.calls[0]?.[0], sendCalls: send.mock.calls.length }).toEqual({
				status: 413,
				sendCalls: 1,
			});
		});

		it("should return envelope with PAYLOAD_TOO_LARGE errorCode for oversized body", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			const body = send.mock.calls[0]![0] as Record<string, unknown>;
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
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest();

			await hook(request, reply);

			expect({ codeCalls: code.mock.calls.length, sendCalls: send.mock.calls.length }).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should allow request when Content-Length is non-numeric", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({
				headers: { "content-length": "not-a-number" },
			});

			await hook(request, reply);

			expect({ codeCalls: code.mock.calls.length, sendCalls: send.mock.calls.length }).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});
	});

	describe("URL length check", () => {
		it("should allow request when URL is within limit", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({ url: "/v1/within-limit" });

			await hook(request, reply);

			expect({ codeCalls: code.mock.calls.length, sendCalls: send.mock.calls.length }).toEqual({
				codeCalls: 0,
				sendCalls: 0,
			});
		});

		it("should reject when URL exceeds limit", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = createMockRequest({ url: longUrl });

			await hook(request, reply);

			expect({ status: code.mock.calls[0]?.[0], sendCalls: send.mock.calls.length }).toEqual({
				status: 414,
				sendCalls: 1,
			});
		});

		it("should return envelope with URI_TOO_LONG errorCode for long URL", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = createMockRequest({ url: longUrl });

			await hook(request, reply);

			const body = send.mock.calls[0]![0] as Record<string, unknown>;
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
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const longUrl = "/" + "a".repeat(config.urlLengthLimitBytes);
			const request = createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
				url: longUrl,
			});

			await hook(request, reply);

			expect(code.mock.calls.map((call) => call[0])).toEqual([413]);
		});
	});

	describe("serialization", () => {
		it("should expose camelCase keys directly from the Zod output schema", async () => {
			const addHook = vi.fn();
			const app = { addHook } as unknown as FastifyInstance;
			registerRequestSizeHooks(app, config);

			const hook = addHook.mock.calls[0]![1] as (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
			const send = vi.fn();
			const code = vi.fn().mockReturnValue({ send });
			const reply = { code, send, sent: false } as unknown as FastifyReply;
			const request = createMockRequest({
				headers: { "content-length": String(config.bodyLimitBytes + 1) },
			});

			await hook(request, reply);

			const body = send.mock.calls[0]![0] as Record<string, unknown>;
			expect(Object.keys(body)).toEqual(["errorCode", "message", "status", "requestId", "timestamp", "endpoint"]);
		});
	});
});
