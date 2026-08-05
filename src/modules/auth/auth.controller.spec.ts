import { type INestApplication, VersioningType } from "@nestjs/common";
import { HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { ResponseInterceptor } from "../../core/interceptors/response.interceptor";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { WhatsappAuthIntentOutputDto } from "./dto/whatsapp-auth-intent-output.dto";

describe("AuthController", () => {
	let controller: AuthController;
	let authService: { createWhatsAppIntent: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		authService = { createWhatsAppIntent: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [{ provide: AuthService, useValue: authService }],
		}).compile();

		controller = module.get(AuthController);
	});

	it("should expose WhatsApp intent creation at whatsapp/intents", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.createWhatsAppIntent)).toBe("whatsapp/intents");
	});

	it("should prevent authentication intent responses from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.createWhatsAppIntent)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should limit WhatsApp intent creation to five requests per IP", () => {
		expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.createWhatsAppIntent)).toBe(5);
	});

	it("should apply a one-minute rate-limit window to WhatsApp intent creation", () => {
		expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.createWhatsAppIntent)).toBe(60_000);
	});

	it("should return the authentication intent created by the service", async () => {
		const expectedIntent = new WhatsappAuthIntentOutputDto({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			code: "AUTH-K7F9Q2M8VD",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});
		authService.createWhatsAppIntent.mockResolvedValue(expectedIntent);

		const result = await controller.createWhatsAppIntent();

		expect(result).toBe(expectedIntent);
	});

	it("should expose the versioned HTTP response with a snake_case envelope and no request body", async () => {
		const expectedIntent = new WhatsappAuthIntentOutputDto({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			code: "AUTH-K7F9Q2M8VD",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});
		authService.createWhatsAppIntent.mockResolvedValue(expectedIntent);
		const module = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [{ provide: AuthService, useValue: authService }],
		}).compile();
		const app: INestApplication = module.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		app.useGlobalInterceptors(new ResponseInterceptor());
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/v1/auth/whatsapp/intents",
				headers: { "x-request-id": "5d810333-cf26-4e65-bb30-4f8510dcf678" },
			});
		const body = response.json() as { data: unknown; endpoint: string };
		await app.close();

		expect({
			statusCode: response.statusCode,
			cacheControl: response.headers["cache-control"],
			data: body.data,
			endpoint: body.endpoint,
		}).toEqual({
			statusCode: 201,
			cacheControl: "no-store",
			data: {
				intent_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				code: "AUTH-K7F9Q2M8VD",
				expires_at: "2026-08-05T15:15:00.000Z",
			},
			endpoint: "/v1/auth/whatsapp/intents",
		});
	});
});
