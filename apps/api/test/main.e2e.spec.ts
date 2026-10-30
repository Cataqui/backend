import type { OpenAPIObject } from "@nestjs/swagger";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import * as td from "testdouble";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { getStorageToken, ThrottlerStorageService } from "@nestjs/throttler";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { requestSizeConfig } from "../src/core/config/request-size.config";
import { runtimeConfig, type RuntimeConfig } from "../src/core/config/runtime.config";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { PrismaService } from "../src/core/prisma/prisma.service";

afterEach(() => td.reset());

process.env["DATABASE_APP_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

const authenticatedHeaders = {
	"x-cataqui-auth-session": JSON.stringify({
		accountId: "00000000-0000-4000-8000-000000000001",
		sessionId: "00000000-0000-4000-8000-000000000002",
		expiresAt: "2026-10-19T15:00:00.000Z",
	} satisfies AuthenticatedSession),
};

async function _buildApp(params: { environment?: RuntimeConfig["environment"] } = {}): Promise<NestFastifyApplication> {
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(runtimeConfig.KEY)
		.useValue({ environment: params.environment ?? "development" } satisfies RuntimeConfig)
		.overrideProvider(ApiWorkerPortal)
		.useValue(td.object<ApiWorkerPortal>())
		.overrideProvider(PrismaService)
		.useValue(td.object<PrismaService>())
		.overrideProvider(getStorageToken())
		.useValue(new ThrottlerStorageService())
		.overrideProvider(HealthCheckService)
		.useValue(td.object<HealthCheckService>())
		.compile();

	const sizeConfig = requestSizeConfig();

	const app = moduleRef.createNestApplication<NestFastifyApplication>(
		new FastifyAdapter({
			bodyLimit: sizeConfig.bodyLimitBytes,
			requestTimeout: sizeConfig.requestTimeoutMs,
			connectionTimeout: sizeConfig.connectionTimeoutMs,
			handlerTimeout: sizeConfig.handlerTimeoutMs,
			keepAliveTimeout: sizeConfig.keepAliveTimeoutMs,
		}),
	);

	await configureApp(app);
	await app.init();

	return app;
}

describe("Main (e2e)", () => {
	describe("health endpoint", () => {
		it("should expose process liveness without a response body", async () => {
			const app = await _buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health/live" });
			await app.close();

			expect({ statusCode: response.statusCode, body: response.body }).toEqual({ statusCode: 204, body: "" });
		});

		it("should answer the Docker liveness HEAD probe", async () => {
			const app = await _buildApp();

			const response = await app.inject({ method: "HEAD", url: "/v1/health/live" });
			await app.close();

			expect(response.statusCode).toBe(204);
		});

		it("should expose dependency health directly without the public success envelope", async () => {
			const app = await _buildApp();
			const health = { status: "ok", details: { database: { status: "up" } } } satisfies Awaited<
				ReturnType<HealthCheckService["check"]>
			>;
			td.when(app.get(HealthCheckService).check(td.matchers.anything())).thenResolve(health);
			try {
				const response = await app.inject({ method: "GET", url: "/v1/health" });
				expect({ statusCode: response.statusCode, body: response.json() }).toEqual({ statusCode: 200, body: health });
			} finally {
				await app.close();
			}
		});
	});

	describe("Swagger docs", () => {
		it("documents shared success, pagination and app-owned error contracts", async () => {
			const app = await _buildApp();
			try {
				const response = await app.inject({ method: "GET", url: "/docs-json" });
				const document = response.json<OpenAPIObject>();
				expect({ status: response.statusCode, document: document }).toMatchObject({
					status: 200,
					document: {
						paths: {
							"/v1/feed": {
								get: {
									responses: {
										default: {
											content: { "application/json": { schema: { $ref: "#/components/schemas/HttpErrorOutput" } } },
										},
										"200": {
											content: {
												"application/json": {
													schema: { $ref: "#/components/schemas/FeedItemOutputPaginatedSuccessResponse" },
												},
											},
										},
									},
								},
							},
							"/v1/profiles/me": {
								get: {
									responses: {
										"200": {
											content: {
												"application/json": {
													schema: { $ref: "#/components/schemas/ProfileOutputSuccessResponse" },
												},
											},
										},
									},
								},
							},
						},
						components: {
							schemas: {
								HttpErrorOutput: { properties: { errorCode: { enum: Object.values(ErrorCode) } } },
								FeedItemOutputPaginatedSuccessResponse: {
									required: ["data", "requestId", "timestamp", "endpoint", "pagination"],
									properties: {
										pagination: {
											allOf: [{ $ref: "#/components/schemas/PaginationOutput" }],
											description: "Pagination metadata",
										},
									},
								},
							},
						},
					},
				});
			} finally {
				await app.close();
			}
		});

		it.each(["/docs", "/docs-json", "/docs-yaml", "/docs/swagger-ui.css"])(
			"serves %s without a session in development",
			async (url) => {
				const app = await _buildApp();

				const response = await app.inject({ method: "GET", url: url });

				expect(response.statusCode).toBe(200);

				await app.close();
			},
		);
	});

	describe("authentication defaults", () => {
		it.each(["/v1/feed", "/v1/profiles/me"])("requires a session for %s", async (url) => {
			const app = await _buildApp();
			try {
				const response = await app.inject({ method: "GET", url: url });
				expect({ status: response.statusCode, errorCode: response.json<{ errorCode: ErrorCode }>().errorCode }).toEqual(
					{
						status: 401,
						errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED,
					},
				);
			} finally {
				await app.close();
			}
		});

		it.each(["staging", "production"] as const)(
			"does not register documentation in %s even with a session",
			async (environment) => {
				const app = await _buildApp({ environment: environment });
				try {
					for (const url of ["/docs", "/docs-json", "/docs-yaml", "/docs/swagger-ui.css"]) {
						for (const headers of [{}, authenticatedHeaders]) {
							const response = await app.inject({ method: "GET", url: url, headers: headers });
							expect(response.statusCode).toBe(404);
						}
					}
				} finally {
					await app.close();
				}
			},
		);
	});

	describe("request validation", () => {
		it("should return API-owned structured field violations without raw Zod metadata", async () => {
			const app = await _buildApp();

			const response = await app.inject({
				method: "POST",
				url: "/v1/profiles",
				headers: { ...authenticatedHeaders, "content-type": "application/json" },
				payload: { name: "", initialContacts: [] },
			});
			await app.close();

			const body = response.json() as Record<string, unknown>;
			const violations = body["violations"] as Record<string, unknown>[];

			expect({
				statusCode: response.statusCode,
				errorCode: body["errorCode"],
				message: body["message"],
				violation: violations[0],
			}).toEqual({
				statusCode: 400,
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				violation: {
					path: ["name"],
					message: expect.any(String),
				},
			});
		});
	});

	describe("versioning", () => {
		it("should return 404 when version prefix is missing", async () => {
			const app = await _buildApp();

			const response = await app.inject({ method: "GET", url: "/health" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});

		it("should return 404 for unsupported API version", async () => {
			const app = await _buildApp();

			const response = await app.inject({ method: "GET", url: "/v2/health" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});
	});

	describe("server status", () => {
		it("should require authentication for the root endpoint", async () => {
			const app = await _buildApp();
			try {
				const response = await app.inject({ method: "GET", url: "/" });
				expect({ statusCode: response.statusCode, body: response.json() }).toMatchObject({
					statusCode: 401,
					body: { errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED },
				});
			} finally {
				await app.close();
			}
		});

		it("should expose the running API identity and deployment environment without a version prefix", async () => {
			const app = await _buildApp();
			try {
				const response = await app.inject({ method: "GET", url: "/", headers: authenticatedHeaders });
				expect({ statusCode: response.statusCode, body: response.json() }).toEqual({
					statusCode: 200,
					body: { status: "ok", message: "Cataquí API server is running...", environment: expect.any(String) },
				});
			} finally {
				await app.close();
			}
		});
	});

	describe("default authentication", () => {
		it.each([
			"/v1/feed",
			"/v1/jobs/00000000-0000-4000-8000-000000000001",
			"/v1/jobs/00000000-0000-4000-8000-000000000001/contact/00000000-0000-4000-8000-000000000002",
			"/v1/profiles/me",
		])("should require authentication before reading %s", async (url) => {
			const app = await _buildApp();
			try {
				const response = await app.inject({ method: "GET", url: url });
				expect({ statusCode: response.statusCode, body: response.json() }).toMatchObject({
					statusCode: 401,
					body: { errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED },
				});
			} finally {
				await app.close();
			}
		});
	});

	describe("security headers", () => {
		it("should set Strict-Transport-Security header (HSTS)", async () => {
			const app = await _buildApp();
			td.when(app.get(HealthCheckService).check(td.matchers.anything())).thenResolve({
				status: "ok",
				details: { database: { status: "up" } },
			} satisfies Awaited<ReturnType<HealthCheckService["check"]>>);
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains; preload");

			await app.close();
		});
	});
});
