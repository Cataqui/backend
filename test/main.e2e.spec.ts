import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/core/app.factory";
import { requestSizeConfig } from "../src/core/config/request-size.config";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { PrismaService } from "../src/core/prisma/prisma.service";

process.env["DATABASE_APP_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://localhost:3000";

async function buildApp(): Promise<NestFastifyApplication> {
	const moduleRef = await Test.createTestingModule({
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
		})
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
	it("should boot without errors", async () => {
		const app = await buildApp();
		await app.close();
	});

	describe("health endpoint", () => {
		it("should expose process liveness without a response body", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health/live" });
			await app.close();

			expect({ statusCode: response.statusCode, body: response.body }).toEqual({ statusCode: 204, body: "" });
		});

		it("should answer the Docker liveness HEAD probe", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "HEAD", url: "/v1/health/live" });
			await app.close();

			expect(response.statusCode).toBe(204);
		});

		it("should return 200", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should return health check response (skips envelope)", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body).toHaveProperty("status", "ok");
			expect(body).toHaveProperty("details");
			expect(body["details"]).toHaveProperty("database");

			await app.close();
		});
	});

	describe("Swagger docs", () => {
		it("should return 200 on docs page", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/docs" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});
	});

	describe("request validation", () => {
		it("should return API-owned structured field violations without raw Zod metadata", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "POST",
				url: "/v1/auth/inbound-message/intents",
				headers: { "content-type": "application/json" },
				payload: { channel: "SMS" },
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
					path: ["channel"],
					message: expect.any(String),
				},
			});
		});
	});

	describe("versioning", () => {
		it("should return 404 when version prefix is missing", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/health" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});

		it("should return 404 for unsupported API version", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v2/health" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});
	});

	describe("unknown routes", () => {
		it("should return 404 for unknown route with version prefix", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/nonexistent" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});

		it("should return server status for root", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/" });

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["status"]).toBe("ok");
			expect(body["message"]).toBe("Cataquí API server is running...");
			expect(typeof body["environment"]).toBe("string");

			await app.close();
		});
	});

	describe("method not allowed", () => {
		it("should return 404 for unsupported method on existing route", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "POST", url: "/v1/health" });

			expect(response.statusCode).toBe(404);

			await app.close();
		});
	});

	describe("security headers", () => {
		it("should set Strict-Transport-Security header (HSTS)", async () => {
			const app = await buildApp();
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains; preload");

			await app.close();
		});

		it("should set X-Content-Type-Options header (helmet nosniff)", async () => {
			const app = await buildApp();
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-content-type-options"]).toBe("nosniff");

			await app.close();
		});

		it("should set X-Frame-Options header (helmet frame guard)", async () => {
			const app = await buildApp();
			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");

			await app.close();
		});
	});
});
