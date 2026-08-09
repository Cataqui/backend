import { type INestApplication, RequestMethod, StandardSchemaValidationPipe, VersioningType } from "@nestjs/common";
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AuthSessionController } from "./auth-session.controller";
import { AuthSessionService } from "./auth-session.service";

describe("AuthSessionController", () => {
	let controller: AuthSessionController;
	let authSessionService: {
		logout: ReturnType<typeof vi.fn>;
		refresh: ReturnType<typeof vi.fn>;
		revokeAll: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		authSessionService = {
			logout: vi.fn(),
			refresh: vi.fn(),
			revokeAll: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [AuthSessionController],
			providers: [{ provide: AuthSessionService, useValue: authSessionService }],
		}).compile();

		controller = module.get(AuthSessionController);
	});

	it("should pass the opaque refresh token to session refresh", async () => {
		const session = {
			accessToken: "access-token",
			tokenType: "Bearer" as const,
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: "new-refresh-token",
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "user-id",
		};
		authSessionService.refresh.mockResolvedValue(session);

		const result = await controller.refreshSession({ refreshToken: "presented-refresh-token" });

		expect({ result: result, params: authSessionService.refresh.mock.calls[0]?.[0] }).toEqual({
			result: session,
			params: { currentRefreshToken: "presented-refresh-token" },
		});
	});

	it("should return the current access-token session", () => {
		const result = controller.getCurrentSession({
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});

		expect(result).toEqual({
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: "2026-09-04T15:00:00.000Z",
		});
	});

	it("should pass the refresh token to current-device logout", async () => {
		await controller.logoutCurrentSession({ refreshToken: "presented-refresh-token" });

		expect(authSessionService.logout).toHaveBeenCalledWith({ refreshToken: "presented-refresh-token" });
	});

	it("should expose current-device logout as a POST command", () => {
		expect({
			controllerPath: Reflect.getMetadata(PATH_METADATA, AuthSessionController),
			path: Reflect.getMetadata(PATH_METADATA, controller.logoutCurrentSession),
			method: Reflect.getMetadata(METHOD_METADATA, controller.logoutCurrentSession),
		}).toEqual({ controllerPath: "auth/sessions", path: "logout", method: RequestMethod.POST });
	});

	it("should prevent current-device logout responses from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.logoutCurrentSession)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should revoke every session belonging to the authenticated user", async () => {
		const session = {
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: new Date("2026-09-04T15:00:00.000Z"),
		};

		await controller.revokeAllSessions(session);

		expect(authSessionService.revokeAll).toHaveBeenCalledWith({ session: session });
	});

	it("should accept a camelCase refresh token and return an empty logout response", async () => {
		const module = await Test.createTestingModule({
			controllers: [AuthSessionController],
			providers: [{ provide: AuthSessionService, useValue: authSessionService }],
		}).compile();
		const app: INestApplication = module.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		app.useGlobalPipes(new StandardSchemaValidationPipe());
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/v1/auth/sessions/logout",
				headers: { "content-type": "application/json" },
				payload: { refreshToken: "r".repeat(43) },
			});
		await app.close();

		expect({
			statusCode: response.statusCode,
			cacheControl: response.headers["cache-control"],
			body: response.body,
			serviceParams: authSessionService.logout.mock.calls[0]?.[0],
		}).toEqual({
			statusCode: 204,
			cacheControl: "no-store",
			body: "",
			serviceParams: { refreshToken: "r".repeat(43) },
		});
	});
});
