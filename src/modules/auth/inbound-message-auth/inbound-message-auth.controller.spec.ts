import {
	type INestApplication,
	StandardSchemaSerializerInterceptor,
	StandardSchemaValidationPipe,
	VersioningType,
} from "@nestjs/common";
import { HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { ResponseInterceptor } from "../../../core/interceptors/response.interceptor";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthController } from "./inbound-message-auth.controller";
import { InboundMessageAuthService } from "./inbound-message-auth.service";

function _createFastifyReplyTestDouble() {
	let closeListener: (() => void) | undefined;

	return {
		disconnectClient: () => closeListener?.(),
		header: vi.fn(),
		raw: {
			off: vi.fn((event: string, listener: () => void) => {
				if (event === "close" && closeListener === listener) closeListener = undefined;
			}),
			once: vi.fn((event: string, listener: () => void) => {
				if (event === "close") closeListener = listener;
			}),
		},
		status: vi.fn(),
	};
}

describe("InboundMessageAuthController", () => {
	let controller: InboundMessageAuthController;
	let inboundMessageAuthService: {
		createIntent: ReturnType<typeof vi.fn>;
		exchangeIntentForSession: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		inboundMessageAuthService = { createIntent: vi.fn(), exchangeIntentForSession: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [InboundMessageAuthController],
			providers: [{ provide: InboundMessageAuthService, useValue: inboundMessageAuthService }],
		}).compile();

		controller = module.get(InboundMessageAuthController);
	});

	it("should expose intent creation under the inbound-message feature", () => {
		expect({
			controllerPath: Reflect.getMetadata(PATH_METADATA, InboundMessageAuthController),
			methodPath: Reflect.getMetadata(PATH_METADATA, controller.createIntent),
		}).toEqual({ controllerPath: "auth/inbound-message", methodPath: "intents" });
	});

	it("should expose intent exchange under the inbound-message feature", () => {
		expect({
			controllerPath: Reflect.getMetadata(PATH_METADATA, InboundMessageAuthController),
			methodPath: Reflect.getMetadata(PATH_METADATA, controller.exchangeIntentForSession),
		}).toEqual({ controllerPath: "auth/inbound-message", methodPath: "intents/exchange" });
	});

	it("should prevent intent responses from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.createIntent)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should pass the channel to intent creation", async () => {
		inboundMessageAuthService.createIntent.mockResolvedValue({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			code: "AUTH-K7F9Q2M8VD",
			codeReceiver: "+5511963270517",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});

		await controller.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(inboundMessageAuthService.createIntent).toHaveBeenCalledWith({
			channel: InboundMessageAuthChannel.WHATSAPP,
		});
	});

	it("should return 202 and a polling delay while the intent is pending", async () => {
		const pending = { status: "PENDING" as const, retryAfterSeconds: 1 };
		inboundMessageAuthService.exchangeIntentForSession.mockResolvedValue(pending);
		const reply = _createFastifyReplyTestDouble();

		const result = await controller.exchangeIntentForSession(
			{ intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI" },
			reply as never,
		);

		expect({
			result: result,
			retryAfterHeader: reply.header.mock.calls[0],
			statusCalls: reply.status.mock.calls,
		}).toEqual({
			result: pending,
			retryAfterHeader: ["Retry-After", "1"],
			statusCalls: [],
		});
	});

	it("should return 201 when a verified intent creates a session", async () => {
		const session = {
			accessToken: "access-token",
			tokenType: "Bearer" as const,
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: "refresh-token",
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		};
		inboundMessageAuthService.exchangeIntentForSession.mockResolvedValue(session);
		const reply = _createFastifyReplyTestDouble();

		const result = await controller.exchangeIntentForSession(
			{ intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI" },
			reply as never,
		);

		expect({ result: result, status: reply.status.mock.calls[0]?.[0] }).toEqual({ result: session, status: 201 });
	});

	it("should abort the verification wait when the client disconnects and remove the close listener", async () => {
		let receivedAbortSignal: AbortSignal | undefined;
		inboundMessageAuthService.exchangeIntentForSession.mockImplementation(
			(params: { abortSignal: AbortSignal }) =>
				new Promise((resolve) => {
					receivedAbortSignal = params.abortSignal;
					params.abortSignal.addEventListener(
						"abort",
						() => resolve({ status: "PENDING" as const, retryAfterSeconds: 1 }),
						{ once: true },
					);
				}),
		);
		const reply = _createFastifyReplyTestDouble();

		const exchange = controller.exchangeIntentForSession(
			{ intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI" },
			reply as never,
		);
		reply.disconnectClient();
		await exchange;

		expect({ aborted: receivedAbortSignal?.aborted, closeListenerRemoval: reply.raw.off.mock.calls[0]?.[0] }).toEqual({
			aborted: true,
			closeListenerRemoval: "close",
		});
	});

	it("should accept camelCase intent input and expose the existing response contract", async () => {
		inboundMessageAuthService.createIntent.mockResolvedValue({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			code: "AUTH-K7F9Q2M8VD",
			codeReceiver: "+5511963270517",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});
		const module = await Test.createTestingModule({
			controllers: [InboundMessageAuthController],
			providers: [{ provide: InboundMessageAuthService, useValue: inboundMessageAuthService }],
		}).compile();
		const app: INestApplication = module.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		app.useGlobalPipes(new StandardSchemaValidationPipe());
		app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)), new ResponseInterceptor());
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/v1/auth/inbound-message/intents",
				headers: {
					"content-type": "application/json",
					"x-request-id": "5d810333-cf26-4e65-bb30-4f8510dcf678",
				},
				payload: { channel: "WHATSAPP" },
			});
		const body = response.json() as { data: unknown; endpoint: string };
		await app.close();

		expect({
			statusCode: response.statusCode,
			cacheControl: response.headers["cache-control"],
			data: body.data,
			endpoint: body.endpoint,
			creationParams: inboundMessageAuthService.createIntent.mock.calls[0]?.[0],
		}).toEqual({
			statusCode: 201,
			cacheControl: "no-store",
			data: {
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
				code: "AUTH-K7F9Q2M8VD",
				codeReceiver: "+5511963270517",
				expiresAt: "2026-08-05T15:15:00.000Z",
			},
			endpoint: "/v1/auth/inbound-message/intents",
			creationParams: { channel: InboundMessageAuthChannel.WHATSAPP },
		});
	});

	it("should return the existing pending polling contract", async () => {
		inboundMessageAuthService.exchangeIntentForSession.mockResolvedValue({ status: "PENDING", retryAfterSeconds: 1 });
		const module = await Test.createTestingModule({
			controllers: [InboundMessageAuthController],
			providers: [{ provide: InboundMessageAuthService, useValue: inboundMessageAuthService }],
		}).compile();
		const app: INestApplication = module.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		app.useGlobalPipes(new StandardSchemaValidationPipe());
		app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)), new ResponseInterceptor());
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/v1/auth/inbound-message/intents/exchange",
				headers: { "content-type": "application/json" },
				payload: { intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI" },
			});
		const body = response.json() as { data: unknown };
		await app.close();

		expect({
			statusCode: response.statusCode,
			cacheControl: response.headers["cache-control"],
			retryAfter: response.headers["retry-after"],
			data: body.data,
		}).toEqual({
			statusCode: 202,
			cacheControl: "no-store",
			retryAfter: "1",
			data: { status: "PENDING", retryAfterSeconds: 1 },
		});
	});
});
