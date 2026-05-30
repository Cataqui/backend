import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./shared/utils/app.factory";
import { requestSizeConfig } from "./shared/config/request-size.config";

async function bootstrap(): Promise<void> {
	const logger = new Logger("Bootstrap");

	const sizeConfig = requestSizeConfig();

	const fastifyAdapter = new FastifyAdapter({
		bodyLimit: sizeConfig.bodyLimitBytes,
		requestTimeout: sizeConfig.requestTimeoutMs,
		connectionTimeout: sizeConfig.connectionTimeoutMs,
		keepAliveTimeout: sizeConfig.keepAliveTimeoutMs,
	});

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
	configureApp(app);

	const port = process.env["PORT"] ?? 3000;
	await app.listen(port);

	logger.log(`Server running on http://localhost:${port}`);
	logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

void bootstrap();
