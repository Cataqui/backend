import { Test } from "@nestjs/testing";
import { type NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { HealthCheckService } from "@nestjs/terminus";
import { instanceToPlain } from "class-transformer";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { PrismaExceptionFilter } from "../src/core/prisma/filters/prisma-exception.filter";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { LoggingInterceptor } from "../src/core/interceptors/logging.interceptor";
import { ResponseInterceptor } from "../src/core/interceptors/response.interceptor";
import { requestSizeConfig, REQUEST_SIZE_CONFIG_KEY } from "../src/core/config/request-size.config";
import type { IRequestSizeConfig } from "../src/core/config/request-size.config";
import { registerRequestSizeHooks } from "../src/core/hooks/request-size.hook";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { ErrorOutputDto } from "../src/core/errors/error-output.dto";

process.env["DATABASE_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["DATABASE_DIRECT_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

const TEST_CONFIG: IRequestSizeConfig = {
	bodyLimitBytes: 2048,
	urlLengthLimitBytes: 128,
	requestTimeoutMs: 10_000,
	connectionTimeoutMs: 5_000,
	keepAliveTimeoutMs: 5_000,
};

function expectedErrorBody(errorCode: ErrorCode, message: string, status: number, endpoint: string): Record<string, unknown> {
	return instanceToPlain(new ErrorOutputDto(errorCode, message, status, "", "", endpoint), { exposeUnsetFields: false }) as Record<string, unknown>;
}

function assertErrorResponse(response: { statusCode: number; body: string }, errorCode: ErrorCode, message: string, status: number, endpoint: string): Record<string, unknown> {
	expect(response.statusCode).toBe(status);

	const body = JSON.parse(response.body) as Record<string, unknown>;
	const expected = expectedErrorBody(errorCode, message, status, endpoint);

	const staticFields = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "request_id" && key !== "timestamp"));
	expect(body).toMatchObject(staticFields);
	expect(body).not.toHaveProperty("errorCode");
	expect(body).not.toHaveProperty("requestId");

	return body;
}

async function buildApp(overrideConfig?: IRequestSizeConfig): Promise<NestFastifyApplication> {
	const effectiveConfig = overrideConfig ?? requestSizeConfig();

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
		testBuilder.overrideProvider(REQUEST_SIZE_CONFIG_KEY).useValue(overrideConfig);
	}

	const moduleRef = await testBuilder.compile();

	const app = moduleRef.createNestApplication<NestFastifyApplication>(
		new FastifyAdapter({
			bodyLimit: effectiveConfig.bodyLimitBytes,
			requestTimeout: effectiveConfig.requestTimeoutMs,
			connectionTimeout: effectiveConfig.connectionTimeoutMs,
			keepAliveTimeout: effectiveConfig.keepAliveTimeoutMs,
		}),
	);

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

	registerRequestSizeHooks(app.getHttpAdapter().getInstance(), effectiveConfig);

	return app;
}

describe("Request Size Limits (e2e)", () => {
	describe("default limits", () => {
		it("should allow valid requests", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should reject requests with Content-Length exceeding body limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			assertErrorResponse(response, ErrorCode.PAYLOAD_TOO_LARGE, "Request body exceeds the maximum allowed size.", 413, "/v1/health");

			await app.close();
		});

		it("should reject requests with body content exceeding body limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const largeBody = "x".repeat(TEST_CONFIG.bodyLimitBytes + 1);
			const response = await app.inject({
				method: "POST",
				url: "/v1/health",
				headers: { "content-type": "application/json" },
				body: largeBody,
			});

			assertErrorResponse(response, ErrorCode.PAYLOAD_TOO_LARGE, "Request body exceeds the maximum allowed size.", 413, "/v1/health");

			await app.close();
		});

		it("should reject requests with URL exceeding length limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const longUrl = "/" + "a".repeat(TEST_CONFIG.urlLengthLimitBytes);
			const response = await app.inject({ method: "GET", url: longUrl });

			assertErrorResponse(response, ErrorCode.URI_TOO_LONG, "Request URL exceeds the maximum allowed length.", 414, longUrl);

			await app.close();
		});

		it("should allow requests with URL within length limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const shortUrl = "/v1/health";
			const response = await app.inject({ method: "GET", url: shortUrl });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should return envelope with snake_case keys on rejection", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			const dtoKeys = Object.keys(instanceToPlain(new ErrorOutputDto(ErrorCode.PAYLOAD_TOO_LARGE, "", 0, "", "", ""), { exposeUnsetFields: false }));

			for (const key of dtoKeys) {
				expect(body).toHaveProperty(key);
			}

			expect(body).not.toHaveProperty("errorCode");
			expect(body).not.toHaveProperty("requestId");

			await app.close();
		});

		it("should include a valid UUID request_id in envelope", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["request_id"] as string).toMatch(/^[0-9a-f-]{36}$/);

			await app.close();
		});

		it("should include endpoint matching request URL in envelope", async () => {
			const app = await buildApp(TEST_CONFIG);

			const longUrl = "/" + "a".repeat(TEST_CONFIG.urlLengthLimitBytes);
			const response = await app.inject({ method: "GET", url: longUrl });

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["endpoint"] as string).toBe(longUrl);

			await app.close();
		});

		it("should apply bodyLimit to the FastifyAdapter", async () => {
			const app = await buildApp(TEST_CONFIG);

			const fastifyInstance = app.getHttpAdapter().getInstance();
			const initialConfig = fastifyInstance.initialConfig as Record<string, unknown>;

			expect(initialConfig["bodyLimit"]).toBe(TEST_CONFIG.bodyLimitBytes);

			await app.close();
		});
	});
});
