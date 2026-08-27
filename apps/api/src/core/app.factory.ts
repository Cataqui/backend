import helmet from "@fastify/helmet";
import {
	Logger,
	StandardSchemaSerializerInterceptor,
	StandardSchemaValidationPipe,
	VersioningType,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { AppSwagger } from "./app.swagger";
import { requestSizeConfig } from "./config/request-size.config";
import { CorsBlockedError } from "./errors/cors-blocked.error";
import { HttpExceptionFilter } from "./errors/filters/http-exception.filter";
import { RequestValidationError } from "./errors/request-validation.error";
import { registerRequestSizeHooks } from "./hooks/request-size.hook";
import { ResponseInterceptor } from "./interceptors/response.interceptor";
import { registerHttpObservabilityHooks } from "./observability/http-observability.hook";
import { ObservabilityService } from "./observability/observability.service";
import { ProductAnalyticsInterceptor } from "./observability/product-analytics.interceptor";
import { PrismaExceptionFilter } from "./prisma/filters/prisma-exception.filter";

export async function configureApp(app: NestFastifyApplication): Promise<void> {
	const corsLogger = new Logger("CORS");
	const observabilityService = app.get(ObservabilityService);
	const reflector = app.get(Reflector);

	const sizeConfig = requestSizeConfig();

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
					violations: issues.map((issue) => ({
						path:
							issue.path?.map((pathSegment: PropertyKey | StandardSchemaV1.PathSegment) => {
								const key = typeof pathSegment === "object" ? pathSegment.key : pathSegment;
								return typeof key === "number" ? key : String(key);
							}) ?? [],
						message: issue.message,
					})),
				}),
		}),
	);

	// Nest evaluates global filters in reverse registration order. Keep the catch-all first so
	// Prisma errors reach their specific filter before the generic HTTP fallback.
	app.useGlobalFilters(
		new HttpExceptionFilter({ observabilityService: observabilityService }),
		new PrismaExceptionFilter({ observabilityService: observabilityService }),
	);

	// Nest runs response interceptors in reverse order. ResponseInterceptor creates the wire envelope,
	// then Standard Schema validates and serializes that complete response contract.
	app.useGlobalInterceptors(
		new ProductAnalyticsInterceptor({ observabilityService: observabilityService, reflector: reflector }),
		new StandardSchemaSerializerInterceptor(reflector),
		new ResponseInterceptor(),
	);

	const isDevelopment = process.env["NODE_ENV"] === "development" || process.env["NODE_ENV"] === "test";
	const fastifyInstance = app.getHttpAdapter().getInstance();
	registerHttpObservabilityHooks({
		fastifyInstance: fastifyInstance,
		observabilityService: observabilityService,
	});

	app.enableCors({
		origin: isDevelopment
			? true
			: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
					if (origin === undefined) return callback(null, true);

					if (allowedOrigins.includes(origin)) callback(null, true);
					else {
						corsLogger.warn({ event: ObservabilityEventConstants.API_CORS_REQUEST_BLOCKED_EVENT });
						callback(new CorsBlockedError(), false);
					}
				},
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "Accept-Language", "x-request-id"],
	});

	fastifyInstance.removeContentTypeParser("text/plain");
	await fastifyInstance.register(helmet, {
		contentSecurityPolicy: true,
		hsts: {
			maxAge: 31536000, // 1 Year
			includeSubDomains: true,
			preload: true,
		},
	});
	registerRequestSizeHooks({
		config: sizeConfig,
		fastifyInstance: fastifyInstance,
		observabilityService: observabilityService,
	});

	AppSwagger.setup(app);
}
