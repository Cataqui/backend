import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ErrorCode } from "../errors/error-code.enum";
import { requestSizeConfig } from "../config/request-size.config";
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

			expect(code).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
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

			expect(code).toHaveBeenCalledWith(413);
			expect(send).toHaveBeenCalled();
		});

		it("should return envelope with PAYLOAD_TOO_LARGE error_code for oversized body", async () => {
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
			expect(body).toHaveProperty("error_code", ErrorCode.PAYLOAD_TOO_LARGE);
			expect(body).toHaveProperty("message", "Request body exceeds the maximum allowed size.");
			expect(body).toHaveProperty("status", 413);
			expect(body).toHaveProperty("request_id", expect.any(String));
			expect(body).toHaveProperty("timestamp", expect.any(String));
			expect(body).toHaveProperty("endpoint", "/v1/test");
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

			expect(code).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
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

			expect(code).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
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

			expect(code).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
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

			expect(code).toHaveBeenCalledWith(414);
			expect(send).toHaveBeenCalled();
		});

		it("should return envelope with URI_TOO_LONG error_code for long URL", async () => {
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
			expect(body).toHaveProperty("error_code", ErrorCode.URI_TOO_LONG);
			expect(body).toHaveProperty("message", "Request URL exceeds the maximum allowed length.");
			expect(body).toHaveProperty("status", 414);
			expect(body).toHaveProperty("request_id", expect.any(String));
			expect(body).toHaveProperty("timestamp", expect.any(String));
			expect(body).toHaveProperty("endpoint", longUrl);
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

			expect(code).toHaveBeenCalledWith(413);
			expect(code).not.toHaveBeenCalledWith(414);
		});
	});

	describe("serialization", () => {
		it("should expose snake_case keys via instanceToPlain", async () => {
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
			expect(body).toHaveProperty("error_code");
			expect(body).toHaveProperty("request_id");
			expect(body).not.toHaveProperty("errorCode");
			expect(body).not.toHaveProperty("requestId");
		});
	});
});
