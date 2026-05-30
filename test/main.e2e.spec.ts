import { Test } from "@nestjs/testing";
import { type NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { HealthCheckService } from "@nestjs/terminus";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { configureApp } from "../src/shared/utils/app.factory";
import { requestSizeConfig } from "../src/shared/config/request-size.config";

process.env["DATABASE_POOLER_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
process.env["DATABASE_DIRECT_URL"] = "postgresql://test:test@localhost:5432/cataqui?schema=public";
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
			keepAliveTimeout: sizeConfig.keepAliveTimeoutMs,
		}),
	);

	configureApp(app);
	await app.init();

	return app;
}

describe("Main (e2e)", () => {
	it("should boot without errors", async () => {
		const app = await buildApp();
		await app.close();
	});

	describe("health endpoint", () => {
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

		it("should return 404 for root", async () => {
			const app = await buildApp();

			const response = await app.inject({ method: "GET", url: "/" });

			expect(response.statusCode).toBe(404);

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
});
