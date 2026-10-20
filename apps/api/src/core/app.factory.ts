import helmet from "@fastify/helmet";
import {
	Logger,
	StandardSchemaSerializerInterceptor,
	StandardSchemaValidationPipe,
	VersioningType,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { toValidationViolations } from "@cataqui/response";
import { AppSwagger } from "./app.swagger";
import { requestSizeConfig } from "./config/request-size.config";
import { runtimeConfig, type RuntimeConfig } from "./config/runtime.config";
import { CorsBlockedError } from "./errors/cors-blocked.error";
import { HttpExceptionFilter } from "./errors/filters/http-exception.filter";
import { RequestValidationError } from "./errors/request-validation.error";
import { registerRequestSizeHooks } from "./hooks/request-size.hook";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { ResponseInterceptor } from "./interceptors/response.interceptor";
import { PrismaExceptionFilter } from "./prisma/filters/prisma-exception.filter";

export async function configureApp(app: NestFastifyApplication): Promise<void> {
	const corsLogger = new Logger("CORS");

	const allowedOrigins =
		process.env["CORS_ORIGINS"]
			?.split(",")
			.map((o) => o.trim())
			.filter(Boolean) || [];

	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	app.useGlobalPipes(
		new StandardSchemaValidationPipe({
			exceptionFactory: (issues) =>
				new RequestValidationError({
					violations: toValidationViolations({ issues: issues }),
				}),
		}),
	);

	// Nest evaluates global filters in reverse registration order. Keep the catch-all first so
	// Prisma errors reach their specific filter before the generic HTTP fallback.
	app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());

	// Nest runs response interceptors in reverse order. ResponseInterceptor creates the wire envelope,
	// then Standard Schema validates and serializes that complete response contract.
	app.useGlobalInterceptors(
		new LoggingInterceptor(),
		new StandardSchemaSerializerInterceptor(app.get(Reflector)),
		new ResponseInterceptor(),
	);

	app.enableCors({
		origin:
			app.get<RuntimeConfig>(runtimeConfig.KEY).environment === "development"
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
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "Accept-Language", "x-request-id"],
	});

	const fastifyInstance = app.getHttpAdapter().getInstance();
	fastifyInstance.removeContentTypeParser("text/plain");
	await fastifyInstance.register(helmet, {
		contentSecurityPolicy: true,
		hsts: {
			maxAge: 31536000, // 1 Year
			includeSubDomains: true,
			preload: true,
		},
	});
	registerRequestSizeHooks(fastifyInstance, requestSizeConfig());

	AppSwagger.setup(app);
}
