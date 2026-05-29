import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ValidationPipe, Logger, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./shared/errors/filters/http-exception.filter";
import { PrismaExceptionFilter } from "./shared/prisma/filters/prisma-exception.filter";
import { LoggingInterceptor } from "./shared/interceptors/logging.interceptor";
import { ResponseInterceptor } from "./shared/interceptors/response.interceptor";

async function bootstrap(): Promise<void> {
	const logger = new Logger("Bootstrap");

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		}),
	);

	app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
	app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

	const swaggerConfig = new DocumentBuilder()
		.setTitle("Cataquí API")
		.setDescription("Cataquí is the real-time opportunity layer of the city: " + "a hyperlocal feed for quick jobs, side hustles, informal work, and short-term tasks.")
		.setVersion("1.0")
		.build();

	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup("docs", app, document);

	const port = process.env["PORT"] ?? 3000;
	await app.listen(port);

	logger.log(`Server running on http://localhost:${port}`);
	logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

void bootstrap();
