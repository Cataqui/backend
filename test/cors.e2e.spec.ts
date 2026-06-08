import { Test } from "@nestjs/testing";
import { type NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { configureApp } from "../src/core/app.factory";

process.env["NODE_ENV"] = "production";
process.env["DATABASE_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["DATABASE_DIRECT_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["CORS_ORIGINS"] = "http://allowed-origin.com";

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

	const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

	await configureApp(app);
	await app.init();

	return app;
}

describe("CORS (e2e)", () => {
	describe("allowed origin", () => {
		it("should return 200 for requests from allowed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://allowed-origin.com" },
			});

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should set access-control-allow-origin to the request origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://allowed-origin.com" },
			});

			expect(response.headers["access-control-allow-origin"]).toBe("http://allowed-origin.com");

			await app.close();
		});

		it("should set access-control-allow-credentials to true", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://allowed-origin.com" },
			});

			expect(response.headers["access-control-allow-credentials"]).toBe("true");

			await app.close();
		});

		it("should include Vary header with Origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://allowed-origin.com" },
			});

			expect(response.headers["vary"]).toContain("Origin");

			await app.close();
		});
	});

	describe("disallowed origin", () => {
		it("should return 403 for requests from disallowed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://evil.com" },
			});

			expect(response.statusCode).toBe(403);

			await app.close();
		});

		it("should return CORS_BLOCKED error code in envelope", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://evil.com" },
			});

			const body = JSON.parse(response.body) as Record<string, unknown>;
			expect(body["error_code"]).toBe("CORS_BLOCKED");

			await app.close();
		});
	});

	describe("no origin (non-browser)", () => {
		it("should return 200 when no Origin header is present", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should not set access-control-allow-origin when no Origin header is present", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/v1/health" });

			expect(response.headers["access-control-allow-origin"]).toBeUndefined();

			await app.close();
		});
	});

	describe("preflight OPTIONS", () => {
		it("should return 204 for preflight from allowed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://allowed-origin.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.statusCode).toBe(204);

			await app.close();
		});

		it("should return allowed methods in preflight response", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://allowed-origin.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.headers["access-control-allow-methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");

			await app.close();
		});

		it("should return allowed headers in preflight response", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://allowed-origin.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.headers["access-control-allow-headers"]).toBe("Content-Type, Authorization, x-request-id");

			await app.close();
		});

		it("should set access-control-allow-origin in preflight response", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://allowed-origin.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.headers["access-control-allow-origin"]).toBe("http://allowed-origin.com");

			await app.close();
		});

		it("should return 403 for preflight from disallowed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://evil.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.statusCode).toBe(403);

			await app.close();
		});

		it("should include error in body for preflight from disallowed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "OPTIONS",
				url: "/v1/health",
				headers: {
					origin: "http://evil.com",
					"access-control-request-method": "GET",
				},
			});

			expect(response.body).toBeTruthy();

			await app.close();
		});
	});

	describe("origin list with spaces and trailing commas", () => {
		beforeEach(() => {
			process.env["CORS_ORIGINS"] = " http://allowed-origin.com, , http://second-allowed.com  ";
		});

		afterEach(() => {
			process.env["CORS_ORIGINS"] = "http://allowed-origin.com";
		});

		it("should allow trimmed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://allowed-origin.com" },
			});

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should allow second trimmed origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "http://second-allowed.com" },
			});

			expect(response.statusCode).toBe(200);

			await app.close();
		});

		it("should disallow empty origin", async () => {
			const app = await buildApp();

			const response = await app.inject({
				method: "GET",
				url: "/v1/health",
				headers: { origin: "" },
			});

			expect(response.statusCode).toBe(403);

			await app.close();
		});
	});
});
