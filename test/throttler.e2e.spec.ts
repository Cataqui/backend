import { ValidationPipe, VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import {
	GLOBAL_THROTTLE_CONFIG_KEY,
	globalThrottleConfig,
	type IGlobalThrottleConfig,
} from "../src/core/config/throttle.config";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { LoggingInterceptor } from "../src/core/interceptors/logging.interceptor";
import { ResponseInterceptor } from "../src/core/interceptors/response.interceptor";
import { PrismaExceptionFilter } from "../src/core/prisma/filters/prisma-exception.filter";
import { PrismaService } from "../src/core/prisma/prisma.service";

process.env["DATABASE_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["DATABASE_DIRECT_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

async function buildApp(overrideConfig?: IGlobalThrottleConfig): Promise<NestFastifyApplication> {
	const testBuilder = Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(PrismaService)
		.useValue({})
		.overrideProvider(HealthCheckService)
		.useValue({
			check: vi.fn().mockResolvedValue({
				status: "ok",
				details: { database: { status: "up" } },
			}),
		});

	if (overrideConfig) {
		testBuilder.overrideProvider(GLOBAL_THROTTLE_CONFIG_KEY).useValue(overrideConfig);
	}

	const moduleRef = await testBuilder.compile();

	const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		}),
	);

	app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
	app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

	await app.init();

	return app;
}

describe("RateLimiter (e2e)", () => {
	describe("with default limit (1000)", () => {
		it("should return 200 when under the limit", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should include X-RateLimit-Limit header", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-limit"]).toBe("1000");

			await app.close();
		});

		it("should match limit from globalThrottleConfig", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-limit"]).toBe(String(globalThrottleConfig().limit));

			await app.close();
		});

		it("should return remaining limit - 1 after first request", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-remaining"]).toBe(String(globalThrottleConfig().limit - 1));

			await app.close();
		});

		it("should return X-RateLimit-Reset close to globalThrottleConfig ttl in seconds", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			const resetSeconds = Number(response.headers["x-ratelimit-reset"]);
			expect(resetSeconds).toBeGreaterThan(globalThrottleConfig().ttl / 1000 - 5);

			await app.close();
		});

		it("should not exceed globalThrottleConfig ttl in X-RateLimit-Reset", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			const resetSeconds = Number(response.headers["x-ratelimit-reset"]);
			expect(resetSeconds).toBeLessThanOrEqual(globalThrottleConfig().ttl / 1000);

			await app.close();
		});

		it("should include X-RateLimit-Remaining header", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-remaining"]).toBeDefined();

			await app.close();
		});

		it("should include a non-negative X-RateLimit-Remaining value", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(Number(response.headers["x-ratelimit-remaining"])).toBeGreaterThanOrEqual(0);

			await app.close();
		});

		it("should include X-RateLimit-Reset header", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-reset"]).toBeDefined();

			await app.close();
		});

		it("should include a positive X-RateLimit-Reset value", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(Number(response.headers["x-ratelimit-reset"])).toBeGreaterThan(0);

			await app.close();
		});
	});

	describe("with low limit (3 per 60s)", () => {
		it("should pass first request", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should return remaining 2 after first request", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-remaining"]).toBe("1");

			await app.close();
		});

		it("should return remaining 0 before rate limit", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-ratelimit-remaining"]).toBe("0");

			await app.close();
		});

		it("should return 429 when over the limit", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(429);

			await app.close();
		});

		it("should return RATE_LIMITED error code on over limit", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body).toHaveProperty("error_code", "RATE_LIMITED");

			await app.close();
		});

		it("should include Retry-After header on blocked response", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["retry-after"]).toBeDefined();

			await app.close();
		});

		it("should include a positive Retry-After value on blocked response", async () => {
			const app = await buildApp({ ttl: 60_000, limit: 3 });

			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			await app.inject({ method: "GET", url: "/v1/health" });
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);

			await app.close();
		});
	});
});
