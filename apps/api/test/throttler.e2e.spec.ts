import {
	Controller,
	Get,
	StandardSchemaSerializerInterceptor,
	StandardSchemaValidationPipe,
	VERSION_NEUTRAL,
	Version,
	VersioningType,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getStorageToken, type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { AuthSessionService } from "../src/modules/auth/auth-session.service";
import { AccessTokenGuard } from "../src/modules/auth/guards/access-token.guard";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { RateLimitedError } from "../src/core/errors/rate-limited.error";
import { RateLimit } from "../src/core/throttle/rate-limit.decorator";
import { ThrottleModule } from "../src/core/throttle/throttle.module";

process.env["DATABASE_APP_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

@Controller("rate-limit-test")
class RateLimitTestController {
	@Get()
	@Version(VERSION_NEUTRAL)
	@RateLimit({ requests: 3, per: "minute" })
	limited(): { status: string } {
		return { status: "ok" };
	}
}

async function _buildApp(
	params: {
		storage?: ThrottlerStorage;
		sessionByAccessToken?: Record<string, { sessionId: string; userId: string }>;
	} = {},
): Promise<NestFastifyApplication> {
	const sessionByAccessToken = params.sessionByAccessToken ?? {
		["a".repeat(43)]: { sessionId: "session-a", userId: "user-a" },
	};
	const moduleRef = await Test.createTestingModule({
		imports: [ThrottleModule],
		controllers: [RateLimitTestController],
		providers: [
			AccessTokenGuard,
			{
				provide: AuthSessionService,
				useValue: {
					getActiveSessionFromAccessTokenOrNull: vi.fn(({ accessToken }: { accessToken: string }) => {
						const session = sessionByAccessToken[accessToken];
						if (session === undefined) return null;

						return { ...session, expiresAt: new Date("2026-09-04T15:00:00.000Z") };
					}),
				},
			},
		],
	})
		.overrideProvider(getStorageToken())
		.useValue(params.storage ?? new ThrottlerStorageService())
		.compile();

	const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
	app.useGlobalPipes(new StandardSchemaValidationPipe());
	app.useGlobalFilters(new HttpExceptionFilter());
	app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
	await app.init();

	return app;
}

const authorization = { authorization: `Bearer ${"a".repeat(43)}` };

describe("User rate limiter (e2e)", () => {
	it("should expose the endpoint-specific user budget", async () => {
		const app = await _buildApp();
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(response.headers["x-ratelimit-limit"]).toBe("3");
	});

	it("should decrement the authenticated user's remaining budget", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("1");
	});

	it("should reject the fourth request in the user's window", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(response.statusCode).toBe(429);
	});

	it("should return the stable rate-limit error code", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(response.json()).toHaveProperty("errorCode", "RATE_LIMITED");
	});

	it("should tell a blocked user when the request can be retried", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
	});

	it("should isolate the budgets of different authenticated users", async () => {
		const secondAuthorization = { authorization: `Bearer ${"b".repeat(43)}` };
		const app = await _buildApp({
			sessionByAccessToken: {
				["a".repeat(43)]: { sessionId: "session-a", userId: "user-a" },
				["b".repeat(43)]: { sessionId: "session-b", userId: "user-b" },
			},
		});
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: secondAuthorization });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("2");
	});

	it("should share one budget across two sessions belonging to the same user", async () => {
		const rotatedAuthorization = { authorization: `Bearer ${"b".repeat(43)}` };
		const app = await _buildApp({
			sessionByAccessToken: {
				["a".repeat(43)]: { sessionId: "session-a", userId: "user-a" },
				["b".repeat(43)]: { sessionId: "session-b", userId: "user-a" },
			},
		});
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: rotatedAuthorization });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("1");
	});

	it("should reject unauthenticated requests before consuming the user budget", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test" });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("2");
	});

	it("should return the common rate-limit response when the user limit cannot be enforced", async () => {
		const unavailableStorage: ThrottlerStorage = {
			increment: vi.fn().mockRejectedValue(new RateLimitedError()),
		};
		const app = await _buildApp({ storage: unavailableStorage });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authorization });
		await app.close();

		expect({ statusCode: response.statusCode, errorCode: response.json().errorCode }).toEqual({
			statusCode: 429,
			errorCode: "RATE_LIMITED",
		});
	});
});
