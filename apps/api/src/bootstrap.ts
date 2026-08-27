import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { AppModule } from "./app.module";
import { configureApp } from "./core/app.factory";
import { requestSizeConfig } from "./core/config/request-size.config";
import { StructuredLogger } from "./core/observability/structured-logger";

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
		bufferLogs: true,
	});
	app.useLogger(app.get(StructuredLogger));
	app.enableShutdownHooks();
	await configureApp(app);

	const port = process.env["PORT"] ?? 3000;
	const host = process.env["HOST"] ?? "0.0.0.0";
	await app.listen(port, host);

	logger.log({ event: ObservabilityEventConstants.API_APPLICATION_STARTED_EVENT, status: "READY" });
	logger.log({ event: ObservabilityEventConstants.API_DOCUMENTATION_AVAILABLE_EVENT, status: "READY" });
}
