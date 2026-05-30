import { Test } from "@nestjs/testing";
import { type NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { HealthCheckService } from "@nestjs/terminus";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { PrismaExceptionFilter } from "../src/shared/prisma/filters/prisma-exception.filter";
import { HttpExceptionFilter } from "../src/shared/errors/filters/http-exception.filter";
import { LoggingInterceptor } from "../src/shared/interceptors/logging.interceptor";
import { ResponseInterceptor } from "../src/shared/interceptors/response.interceptor";
import { THROTTLE_CONFIG_KEY, type IThrottleConfig } from "../src/shared/config/throttle.config";

process.env["DATABASE_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["DATABASE_DIRECT_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";

async function buildApp(throttleConfig?: IThrottleConfig): Promise<NestFastifyApplication> {
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

	if (throttleConfig) {
		testBuilder.overrideProvider(THROTTLE_CONFIG_KEY).useValue(throttleConfig);
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
