import { StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, VersioningType } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import type { IRequestSizeConfig } from "../src/core/config/request-size.config";
import { requestSizeConfig } from "../src/core/config/request-size.config";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { ErrorOutputSchema } from "../src/core/errors/error-output";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { registerRequestSizeHooks } from "../src/core/hooks/request-size.hook";
import { ResponseInterceptor } from "../src/core/interceptors/response.interceptor";
import { ApiErrorOrigin } from "../src/core/observability/api-error-origin.enum";
import { ObservabilityService } from "../src/core/observability/observability.service";
import { PrismaExceptionFilter } from "../src/core/prisma/filters/prisma-exception.filter";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { NotpRepository } from "../src/modules/auth/notp/repositories/notp.repository";

process.env["DATABASE_APP_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

const TEST_CONFIG: IRequestSizeConfig = {
	bodyLimitBytes: 2048,
	urlLengthLimitBytes: 128,
	requestTimeoutMs: 10_000,
	connectionTimeoutMs: 0,
	handlerTimeoutMs: 60_000,
	keepAliveTimeoutMs: 5_000,
};

function expectedErrorBody(
	errorCode: ErrorCode,
	message: string,
	status: number,
	endpoint: string,
): Record<string, unknown> {
	return {
		errorCode: errorCode,
		message: message,
		status: status,
		requestId: "",
		timestamp: "",
		endpoint: endpoint,
	};
}

function assertErrorResponse(
	response: { statusCode: number; body: string },
	errorCode: ErrorCode,
	message: string,
	status: number,
	endpoint: string,
): Record<string, unknown> {
	expect(response.statusCode).toBe(status);

	const body = JSON.parse(response.body) as Record<string, unknown>;
	const expected = expectedErrorBody(errorCode, message, status, endpoint);

	const staticFields = Object.fromEntries(
		Object.entries(expected).filter(([key]) => key !== "requestId" && key !== "timestamp"),
	);
	expect(body).toMatchObject(staticFields);

	return body;
}

async function buildApp(overrideConfig?: IRequestSizeConfig): Promise<NestFastifyApplication> {
	const effectiveConfig = overrideConfig ?? requestSizeConfig();

	const testBuilder = Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(PrismaService)
		.useValue({})
		.overrideProvider(NotpRepository)
		.useValue({})
		.overrideProvider(HealthCheckService)
		.useValue({
			check: vi.fn().mockResolvedValue({
				status: "ok",
				details: { database: { status: "up" } },
			}),
		});

	if (overrideConfig) {
		testBuilder.overrideProvider(requestSizeConfig.KEY).useValue(overrideConfig);
	}

	const moduleRef = await testBuilder.compile();

	const app = moduleRef.createNestApplication<NestFastifyApplication>(
		new FastifyAdapter({
			bodyLimit: effectiveConfig.bodyLimitBytes,
			requestTimeout: effectiveConfig.requestTimeoutMs,
			connectionTimeout: effectiveConfig.connectionTimeoutMs,
			handlerTimeout: effectiveConfig.handlerTimeoutMs,
			keepAliveTimeout: effectiveConfig.keepAliveTimeoutMs,
		}),
	);

	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	app.useGlobalPipes(new StandardSchemaValidationPipe());

	const observabilityService = app.get(ObservabilityService);
	app.useGlobalFilters(
		new HttpExceptionFilter({ observabilityService: observabilityService }),
		new PrismaExceptionFilter({ observabilityService: observabilityService }),
	);
	app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)), new ResponseInterceptor());

	await app.init();

	registerRequestSizeHooks({
		config: effectiveConfig,
		fastifyInstance: app.getHttpAdapter().getInstance(),
		observabilityService: app.get(ObservabilityService),
	});

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
			const recordApiError = vi.spyOn(app.get(ObservabilityService), "recordApiError");

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const responseBody = JSON.parse(response.body) as Record<string, unknown>;
			await app.close();

			expect({
				recordedApiError: recordApiError.mock.calls[0]?.[0],
				responseBody: responseBody,
				responseStatus: response.statusCode,
			}).toEqual({
				recordedApiError: {
					errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
					method: "GET",
					origin: ApiErrorOrigin.CLIENT,
					route: "/v1/health",
					statusCode: 413,
				},
				responseBody: expect.objectContaining({
					endpoint: "/v1/health",
					errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
					message: "Request body exceeds the maximum allowed size.",
					status: 413,
				}),
				responseStatus: 413,
			});
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

			assertErrorResponse(
				response,
				ErrorCode.PAYLOAD_TOO_LARGE,
				"Request body exceeds the maximum allowed size.",
				413,
				"/v1/health",
			);

			await app.close();
		});

		it("should reject requests with URL exceeding length limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const longUrl = `/${"a".repeat(TEST_CONFIG.urlLengthLimitBytes)}`;
			const response = await app.inject({ method: "GET", url: longUrl });

			assertErrorResponse(
				response,
				ErrorCode.URI_TOO_LONG,
				"Request URL exceeds the maximum allowed length.",
				414,
				longUrl,
			);

			await app.close();
		});

		it("should allow requests with URL within length limit", async () => {
			const app = await buildApp(TEST_CONFIG);

			const shortUrl = "/v1/health";
			const response = await app.inject({ method: "GET", url: shortUrl });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should return an error envelope with camelCase keys on rejection", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(ErrorOutputSchema.safeParse(body).success).toBe(true);

			await app.close();
		});

		it("should include a valid UUID requestId in envelope", async () => {
			const app = await buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["requestId"] as string).toMatch(/^[0-9a-f-]{36}$/);

			await app.close();
		});

		it("should include endpoint matching request URL in envelope", async () => {
			const app = await buildApp(TEST_CONFIG);

			const longUrl = `/${"a".repeat(TEST_CONFIG.urlLengthLimitBytes)}`;
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

		it("should keep socket timeout disabled so long-running handlers can finish", async () => {
			const app = await buildApp(TEST_CONFIG);

			const fastifyInstance = app.getHttpAdapter().getInstance();
			const initialConfig = fastifyInstance.initialConfig as Record<string, unknown>;

			expect(initialConfig["connectionTimeout"]).toBe(0);

			await app.close();
		});

		it("should enforce a handler deadline longer than the AI operation deadline", async () => {
			const app = await buildApp(TEST_CONFIG);

			const fastifyInstance = app.getHttpAdapter().getInstance();
			const initialConfig = fastifyInstance.initialConfig as Record<string, unknown>;

			expect(initialConfig["handlerTimeout"]).toBe(60_000);

			await app.close();
		});
	});
});
