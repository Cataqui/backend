import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp } from "./core/app.factory";
import { requestSizeConfig } from "./core/config/request-size.config";
import { TelemetryLogger } from "./core/observability/telemetry-logger";

export async function bootstrap(): Promise<void> {
	const logger = new Logger("Bootstrap");
	const sizeConfig = requestSizeConfig();
	const fastifyAdapter = new FastifyAdapter({
		bodyLimit: sizeConfig.bodyLimitBytes,
		requestTimeout: sizeConfig.requestTimeoutMs,
		connectionTimeout: sizeConfig.connectionTimeoutMs,
		handlerTimeout: sizeConfig.handlerTimeoutMs,
		keepAliveTimeout: sizeConfig.keepAliveTimeoutMs,
		trustProxy: true,
	});

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
		abortOnError: false,
		logger:
			process.env["NODE_ENV"] === "production"
				? new TelemetryLogger({ logLevels: ["error", "warn", "fatal"] })
				: new TelemetryLogger(),
	});
	await configureApp(app);

	const port = process.env["PORT"] ?? 3000;
	const host = process.env["HOST"] ?? "0.0.0.0";
	await app.listen(port, host);

	logger.log(`Server running on http://${host}:${port}`);
	logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
