import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./core/app.factory";
import { requestSizeConfig } from "./core/config/request-size.config";

async function bootstrap(): Promise<void> {
	const logger = new Logger("Bootstrap");

	const sizeConfig = requestSizeConfig();

	const fastifyAdapter = new FastifyAdapter({
		bodyLimit: sizeConfig.bodyLimitBytes,
		requestTimeout: sizeConfig.requestTimeoutMs,
		connectionTimeout: sizeConfig.connectionTimeoutMs,
		keepAliveTimeout: sizeConfig.keepAliveTimeoutMs,
		trustProxy: true,
	});

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
	await configureApp(app);

	const port = process.env["PORT"] ?? 3000;
	const host = process.env["HOST"] ?? "0.0.0.0";
	await app.listen(port, host);

	logger.log(`Server running on http://${host}:${port}`);
	logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

void bootstrap().catch((error: unknown) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	process.stderr.write(`[FATAL] Application failed to start:\n${message}\n`);
	process.exitCode = 1;
});
