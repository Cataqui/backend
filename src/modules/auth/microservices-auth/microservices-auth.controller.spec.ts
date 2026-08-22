import { HttpStatus, RequestMethod } from "@nestjs/common";
import {
	GUARDS_METADATA,
	HEADERS_METADATA,
	HTTP_CODE_METADATA,
	METHOD_METADATA,
	PATH_METADATA,
	VERSION_METADATA,
} from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { UserRateLimitGuard } from "../../../core/guards/user-rate-limit.guard";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { MicroservicesAuthController } from "./microservices-auth.controller";
import { MicroservicesAuthService } from "./microservices-auth.service";

describe("MicroservicesAuthController", () => {
	const authSession = {
		expiresAt: new Date("2026-08-22T16:00:00.000Z"),
		sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	};
	let controller: MicroservicesAuthController;
	let microservicesAuthService: { createGeosearchAccessToken: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		microservicesAuthService = { createGeosearchAccessToken: vi.fn() };
		const module = await Test.createTestingModule({
			controllers: [MicroservicesAuthController],
			providers: [{ provide: MicroservicesAuthService, useValue: microservicesAuthService }],
		})
			.overrideGuard(AccessTokenGuard)
			.useValue({ canActivate: vi.fn() })
			.overrideGuard(UserRateLimitGuard)
			.useValue({ canActivate: vi.fn() })
			.compile();

		controller = module.get(MicroservicesAuthController);
	});

	it("should expose the versioned geosearch token command", () => {
		expect({
			controllerPath: Reflect.getMetadata(PATH_METADATA, MicroservicesAuthController),
			path: Reflect.getMetadata(PATH_METADATA, controller.createGeosearchAccessToken),
			method: Reflect.getMetadata(METHOD_METADATA, controller.createGeosearchAccessToken),
			version: Reflect.getMetadata(VERSION_METADATA, controller.createGeosearchAccessToken),
			status: Reflect.getMetadata(HTTP_CODE_METADATA, controller.createGeosearchAccessToken),
		}).toEqual({
			controllerPath: "auth/microservices",
			path: "geosearch",
			method: RequestMethod.POST,
			version: "1",
			status: HttpStatus.OK,
		});
	});

	it("should prevent the issued access token from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.createGeosearchAccessToken)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});

	it("should authenticate before enforcing the per-user rate limit", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.createGeosearchAccessToken)).toEqual([
			AccessTokenGuard,
			UserRateLimitGuard,
		]);
	});

	it("should limit each user to twenty tokens per rolling day", () => {
		expect({
			requests: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.createGeosearchAccessToken),
			ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.createGeosearchAccessToken),
		}).toEqual({ requests: 20, ttl: 86_400_000 });
	});

	it("should issue the geosearch token for the authenticated user", async () => {
		const accessToken = {
			accessToken: "header.payload.signature",
			expiresAt: "2026-08-22T15:10:00.000Z",
			tokenType: "Bearer" as const,
		};
		microservicesAuthService.createGeosearchAccessToken.mockResolvedValue(accessToken);

		const result = await controller.createGeosearchAccessToken(authSession);

		expect({ result: result, params: microservicesAuthService.createGeosearchAccessToken.mock.calls[0]?.[0] }).toEqual({
			result: accessToken,
			params: { userId: authSession.userId },
		});
	});
});
