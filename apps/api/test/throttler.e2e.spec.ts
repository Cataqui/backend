import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import * as td from "testdouble";
import {
	Controller,
	Get,
	StandardSchemaSerializerInterceptor,
	StandardSchemaValidationPipe,
	VERSION_NEUTRAL,
	Version,
	VersioningType,
} from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { AuthenticationGuard } from "../src/modules/authentication/authentication.guard";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { getStorageToken, type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { AuthenticationModule } from "../src/modules/authentication/authentication.module";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { RateLimitedError } from "../src/core/errors/rate-limited.error";
import { RateLimit } from "../src/core/throttle/rate-limit.decorator";
import { ThrottleModule } from "../src/core/throttle/throttle.module";

afterEach(() => td.reset());

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

async function _buildApp(params: { storage?: ThrottlerStorage } = {}): Promise<NestFastifyApplication> {
	const moduleRef = await Test.createTestingModule({
		imports: [ThrottleModule, AuthenticationModule],
		controllers: [RateLimitTestController],
		providers: [{ provide: APP_GUARD, useExisting: AuthenticationGuard }],
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

function _sessionHeaders(params: { accountId: string; sessionId: string }): Record<string, string> {
	return {
		"x-cataqui-auth-session": JSON.stringify({
			accountId: params.accountId,
			sessionId: params.sessionId,
			expiresAt: "2026-10-19T15:00:00.000Z",
		} satisfies AuthenticatedSession),
	};
}

const authenticatedHeaders = _sessionHeaders({
	accountId: "00000000-0000-4000-8000-000000000001",
	sessionId: "00000000-0000-4000-8000-000000000002",
});

describe("Account rate limiter (e2e)", () => {
	it("should expose the endpoint-specific account budget", async () => {
		const app = await _buildApp();
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(response.headers["x-ratelimit-limit"]).toBe("3");
	});

	it("should decrement the authenticated account's remaining budget", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("1");
	});

	it("should reject the fourth request in the account's window", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(response.statusCode).toBe(429);
	});

	it("should return the stable rate-limit error code", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(response.json()).toHaveProperty("errorCode", ErrorCode.RATE_LIMITED);
	});

	it("should tell a blocked account when the request can be retried", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
	});

	it("should isolate the budgets of different authenticated accounts", async () => {
		const secondHeaders = _sessionHeaders({
			accountId: "00000000-0000-4000-8000-000000000003",
			sessionId: "00000000-0000-4000-8000-000000000004",
		});
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: secondHeaders });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("2");
	});

	it("should share one budget across two sessions belonging to the same account", async () => {
		const rotatedHeaders = _sessionHeaders({
			accountId: "00000000-0000-4000-8000-000000000001",
			sessionId: "00000000-0000-4000-8000-000000000003",
		});
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: rotatedHeaders });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("1");
	});

	it("should reject unauthenticated requests before consuming the account budget", async () => {
		const app = await _buildApp();
		await app.inject({ method: "GET", url: "/rate-limit-test" });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect(response.headers["x-ratelimit-remaining"]).toBe("2");
	});

	it("should reject a missing session before invoking the rate-limited operation", async () => {
		const app = await _buildApp();
		const response = await app.inject({ method: "GET", url: "/rate-limit-test" });
		await app.close();

		expect({ statusCode: response.statusCode, errorCode: response.json().errorCode }).toEqual({
			statusCode: 401,
			errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED,
		});
	});

	it("should return the common rate-limit response when the account limit cannot be enforced", async () => {
		const unavailableStorage = td.object<ThrottlerStorage>();
		td.when(
			unavailableStorage.increment(
				td.matchers.anything(),
				td.matchers.anything(),
				td.matchers.anything(),
				td.matchers.anything(),
				td.matchers.anything(),
			),
		).thenReject(new RateLimitedError());
		const app = await _buildApp({ storage: unavailableStorage });
		const response = await app.inject({ method: "GET", url: "/rate-limit-test", headers: authenticatedHeaders });
		await app.close();

		expect({ statusCode: response.statusCode, errorCode: response.json().errorCode }).toEqual({
			statusCode: 429,
			errorCode: ErrorCode.RATE_LIMITED,
		});
	});
});
