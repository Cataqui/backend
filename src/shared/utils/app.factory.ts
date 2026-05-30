import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ValidationPipe, VersioningType, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { HttpExceptionFilter } from "../errors/filters/http-exception.filter";
import { PrismaExceptionFilter } from "../prisma/filters/prisma-exception.filter";
import { LoggingInterceptor } from "../interceptors/logging.interceptor";
import { ResponseInterceptor } from "../interceptors/response.interceptor";
import { requestSizeConfig } from "../config/request-size.config";
import { registerRequestSizeHooks } from "../hooks/request-size.hook";
import { CorsBlockedError } from "../errors/cors-blocked.error";

export function configureApp(app: NestFastifyApplication): void {
	const corsLogger = new Logger("CORS");

	const sizeConfig = requestSizeConfig();

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

	app.enableCors({
		origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
			if (!origin) return callback(null, true);

			const allowedOrigins = process.env["CORS_ORIGINS"]?.split(",") || [];

			if (allowedOrigins.includes(origin)) callback(null, true);
			else {
				corsLogger.warn(`CORS Violation Blocked: Unauthorized access attempt from origin [${origin}]`);
				callback(new CorsBlockedError(), false);
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
	});

	const fastifyInstance = app.getHttpAdapter().getInstance();
	registerRequestSizeHooks(fastifyInstance, sizeConfig);

	const swaggerConfig = new DocumentBuilder()
		.setTitle("Cataquí API")
		.setVersion("1.0")
		.addGlobalParameters({
			name: "accept-language",
			in: "header",
			required: false,
			schema: { type: "string", default: "en-US", example: "en-US" },
		})
		.build();

	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup("docs", app, document);
}
