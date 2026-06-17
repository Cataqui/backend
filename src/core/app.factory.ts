import helmet from "@fastify/helmet";
import { BadRequestException, Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { ValidationError } from "class-validator";
import { requestSizeConfig } from "./config/request-size.config";
import { CorsBlockedError } from "./errors/cors-blocked.error";
import { HttpExceptionFilter } from "./errors/filters/http-exception.filter";
import { registerRequestSizeHooks } from "./hooks/request-size.hook";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { ResponseInterceptor } from "./interceptors/response.interceptor";
import { PrismaExceptionFilter } from "./prisma/filters/prisma-exception.filter";
import { ValidationErrorUtils } from "./validation/validation-error.utils";

export async function configureApp(app: NestFastifyApplication): Promise<void> {
	const corsLogger = new Logger("CORS");

	const sizeConfig = requestSizeConfig();

	const allowedOrigins =
		process.env["CORS_ORIGINS"]
			?.split(",")
			.map((o) => o.trim())
			.filter(Boolean) || [];

	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
			exceptionFactory: (errors: ValidationError[]): BadRequestException => {
				const messages = ValidationErrorUtils.formatValidationErrors(errors);
				return new BadRequestException(messages);
			},
		}),
	);

	app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
	app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

	const isDevelopment = process.env["NODE_ENV"] === "development" || process.env["NODE_ENV"] === "test";

	app.enableCors({
		origin: isDevelopment
			? true
			: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
					if (origin === undefined) return callback(null, true);

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
	await fastifyInstance.register(helmet, {
		contentSecurityPolicy: true,
		hsts: {
			maxAge: 31536000, // 1 Year
			includeSubDomains: true,
			preload: true,
		},
	});
	registerRequestSizeHooks(fastifyInstance, sizeConfig);

	if (process.env["NODE_ENV"] !== "production") {
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
}
