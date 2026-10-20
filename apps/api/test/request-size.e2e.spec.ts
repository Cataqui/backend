import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import * as td from "testdouble";
import { StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, VersioningType } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import type { IRequestSizeConfig } from "../src/core/config/request-size.config";
import { requestSizeConfig } from "../src/core/config/request-size.config";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { ApiErrorResponseOutputSchema } from "../src/core/errors/api-error-response-output.schema";
import { HttpExceptionFilter } from "../src/core/errors/filters/http-exception.filter";
import { registerRequestSizeHooks } from "../src/core/hooks/request-size.hook";
import { LoggingInterceptor } from "../src/core/interceptors/logging.interceptor";
import { ResponseInterceptor } from "../src/core/interceptors/response.interceptor";
import { PrismaExceptionFilter } from "../src/core/prisma/filters/prisma-exception.filter";
import { PrismaService } from "../src/core/prisma/prisma.service";

afterEach(() => td.reset());

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

function _expectedErrorBody(params: {
	errorCode: ErrorCode;
	message: string;
	status: number;
	endpoint: string;
}): Record<string, unknown> {
	return {
		errorCode: params.errorCode,
		message: params.message,
		status: params.status,
		endpoint: params.endpoint,
	};
}

async function _buildApp(overrideConfig?: IRequestSizeConfig): Promise<NestFastifyApplication> {
	const effectiveConfig = overrideConfig ?? requestSizeConfig();

	const testBuilder = Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(ApiWorkerPortal)
		.useValue(td.object<ApiWorkerPortal>())
		.overrideProvider(PrismaService)
		.useValue(td.object<PrismaService>())
		.overrideProvider(HealthCheckService)
		.useValue(td.object<HealthCheckService>());

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

	app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
	app.useGlobalInterceptors(
		new LoggingInterceptor(),
		new StandardSchemaSerializerInterceptor(app.get(Reflector)),
		new ResponseInterceptor(),
	);

	await app.init();

	registerRequestSizeHooks(app.getHttpAdapter().getInstance(), effectiveConfig);

	return app;
}

describe("Request Size Limits (e2e)", () => {
	describe("default limits", () => {
		it("should allow valid requests", async () => {
			const app = await _buildApp(TEST_CONFIG);
			td.when(app.get(HealthCheckService).check(td.matchers.anything())).thenResolve({
				status: "ok",
				details: { database: { status: "up" } },
			} satisfies Awaited<ReturnType<HealthCheckService["check"]>>);

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should reject requests with Content-Length exceeding body limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			expect(response.statusCode).toBe(413);

			await app.close();
		});

		it("should return the payload error envelope when Content-Length exceeds the limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			expect(response.json()).toMatchObject(
				_expectedErrorBody({
					errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
					message: "Request body exceeds the maximum allowed size.",
					status: 413,
					endpoint: "/v1/health",
				}),
			);

			await app.close();
		});

		it("should reject requests with body content exceeding body limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const largeBody = "x".repeat(TEST_CONFIG.bodyLimitBytes + 1);
			const response = await app.inject({
				method: "POST",
				url: "/v1/health",
				headers: { "content-type": "application/json" },
				body: largeBody,
			});

			expect(response.statusCode).toBe(413);

			await app.close();
		});

		it("should return the payload error envelope when body content exceeds the limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const largeBody = "x".repeat(TEST_CONFIG.bodyLimitBytes + 1);
			const response = await app.inject({
				method: "POST",
				url: "/v1/health",
				headers: { "content-type": "application/json" },
				body: largeBody,
			});

			expect(response.json()).toMatchObject(
				_expectedErrorBody({
					errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
					message: "Request body exceeds the maximum allowed size.",
					status: 413,
					endpoint: "/v1/health",
				}),
			);

			await app.close();
		});

		it("should reject requests with URL exceeding length limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const longUrl = `/${"a".repeat(TEST_CONFIG.urlLengthLimitBytes)}`;
			const response = await app.inject({ method: "GET", url: longUrl });

			expect(response.statusCode).toBe(414);

			await app.close();
		});

		it("should return the URL error envelope when its length exceeds the limit", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const longUrl = `/${"a".repeat(TEST_CONFIG.urlLengthLimitBytes)}`;
			const response = await app.inject({ method: "GET", url: longUrl });

			expect(response.json()).toMatchObject(
				_expectedErrorBody({
					errorCode: ErrorCode.URI_TOO_LONG,
					message: "Request URL exceeds the maximum allowed length.",
					status: 414,
					endpoint: longUrl,
				}),
			);

			await app.close();
		});

		it("should allow requests with URL within length limit", async () => {
			const app = await _buildApp(TEST_CONFIG);
			td.when(app.get(HealthCheckService).check(td.matchers.anything())).thenResolve({
				status: "ok",
				details: { database: { status: "up" } },
			} satisfies Awaited<ReturnType<HealthCheckService["check"]>>);

			const shortUrl = "/v1/health";
			const response = await app.inject({ method: "GET", url: shortUrl });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should return an error envelope with camelCase keys on rejection", async () => {
			const app = await _buildApp(TEST_CONFIG);

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { "content-length": String(TEST_CONFIG.bodyLimitBytes + 1) },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(ApiErrorResponseOutputSchema.safeParse(body).success).toBe(true);

			await app.close();
		});

		it("should include a valid UUID requestId in envelope", async () => {
			const app = await _buildApp(TEST_CONFIG);

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
			const app = await _buildApp(TEST_CONFIG);

			const longUrl = `/${"a".repeat(TEST_CONFIG.urlLengthLimitBytes)}`;
			const response = await app.inject({ method: "GET", url: longUrl });

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["endpoint"] as string).toBe(longUrl);

			await app.close();
		});
	});
});
