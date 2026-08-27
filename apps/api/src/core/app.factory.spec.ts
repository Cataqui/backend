import type { NestFastifyApplication } from "@nestjs/platform-fastify";

const appFactoryDependencies = vi.hoisted(() => ({
	helmetPlugin: vi.fn(),
	registerHttpObservabilityHooks: vi.fn(),
	registerRequestSizeHooks: vi.fn(),
	requestSizeConfig: vi.fn(),
	setupSwagger: vi.fn(),
}));

vi.mock("@fastify/helmet", () => ({ default: appFactoryDependencies.helmetPlugin }));
vi.mock("./app.swagger", () => ({ AppSwagger: { setup: appFactoryDependencies.setupSwagger } }));
vi.mock("./config/request-size.config", () => ({ requestSizeConfig: appFactoryDependencies.requestSizeConfig }));
vi.mock("./hooks/request-size.hook", () => ({
	registerRequestSizeHooks: appFactoryDependencies.registerRequestSizeHooks,
}));
vi.mock("./observability/http-observability.hook", () => ({
	registerHttpObservabilityHooks: appFactoryDependencies.registerHttpObservabilityHooks,
}));

import { StandardSchemaSerializerInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { configureApp } from "./app.factory";
import { HttpExceptionFilter } from "./errors/filters/http-exception.filter";
import { ResponseInterceptor } from "./interceptors/response.interceptor";
import { ObservabilityService } from "./observability/observability.service";
import { ProductAnalyticsInterceptor } from "./observability/product-analytics.interceptor";
import { PrismaExceptionFilter } from "./prisma/filters/prisma-exception.filter";

function _resetAppFactoryTestDependencies(): void {
	appFactoryDependencies.helmetPlugin.mockReset();
	appFactoryDependencies.registerHttpObservabilityHooks.mockReset();
	appFactoryDependencies.registerRequestSizeHooks.mockReset();
	appFactoryDependencies.requestSizeConfig.mockReset();
	appFactoryDependencies.setupSwagger.mockReset();
}

function _createAppFactoryHarness(params: {
	fastifyInstance: { register: ReturnType<typeof vi.fn>; removeContentTypeParser: ReturnType<typeof vi.fn> };
	observabilityService: ObservabilityService;
	reflector: Reflector;
}) {
	const enableCors = vi.fn();
	const enableVersioning = vi.fn();
	const useGlobalFilters = vi.fn();
	const useGlobalInterceptors = vi.fn();
	const useGlobalPipes = vi.fn();
	const get = vi.fn((token: unknown) => {
		if (token === ObservabilityService) return params.observabilityService;
		if (token === Reflector) return params.reflector;
		throw new Error("Unexpected provider lookup");
	});
	const app = {
		enableCors: enableCors,
		enableVersioning: enableVersioning,
		get: get,
		getHttpAdapter: vi.fn(() => ({ getInstance: () => params.fastifyInstance })),
		useGlobalFilters: useGlobalFilters,
		useGlobalInterceptors: useGlobalInterceptors,
		useGlobalPipes: useGlobalPipes,
	} as unknown as NestFastifyApplication;

	return {
		app: app,
		enableCors: enableCors,
		enableVersioning: enableVersioning,
		get: get,
		useGlobalFilters: useGlobalFilters,
		useGlobalInterceptors: useGlobalInterceptors,
		useGlobalPipes: useGlobalPipes,
	};
}

describe("configureApp", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should connect one observability service to every HTTP telemetry boundary in the required order", async () => {
		_resetAppFactoryTestDependencies();
		vi.stubEnv("CORS_ORIGINS", "https://mobile.cataqui.test");
		vi.stubEnv("NODE_ENV", "test");
		const requestSizeConfiguration = {
			bodyLimitBytes: 512_000,
			connectionTimeoutMs: 0,
			handlerTimeoutMs: 60_000,
			keepAliveTimeoutMs: 5_000,
			requestTimeoutMs: 10_000,
			urlLengthLimitBytes: 8_000,
		};
		appFactoryDependencies.requestSizeConfig.mockReturnValue(requestSizeConfiguration);
		const observabilityService = { recordApiError: vi.fn() } as unknown as ObservabilityService;
		const reflector = {} as Reflector;
		const fastifyInstance = { register: vi.fn(async () => undefined), removeContentTypeParser: vi.fn() };
		const harness = _createAppFactoryHarness({
			fastifyInstance: fastifyInstance,
			observabilityService: observabilityService,
			reflector: reflector,
		});

		await configureApp(harness.app);

		const filters = harness.useGlobalFilters.mock.calls[0] as unknown as [HttpExceptionFilter, PrismaExceptionFilter];
		const interceptors = harness.useGlobalInterceptors.mock.calls[0] as unknown as [
			ProductAnalyticsInterceptor,
			StandardSchemaSerializerInterceptor,
			ResponseInterceptor,
		];
		expect({
			filterTypes: filters.map((filter) => filter.constructor),
			filterTelemetry: filters.map(
				(filter) => (filter as unknown as { _observabilityService: ObservabilityService })._observabilityService,
			),
			httpHookParameters: appFactoryDependencies.registerHttpObservabilityHooks.mock.calls[0]?.[0],
			interceptorTypes: interceptors.map((interceptor) => interceptor.constructor),
			productAnalyticsDependencies: {
				observabilityService: (interceptors[0] as unknown as { _observabilityService: ObservabilityService })
					._observabilityService,
				reflector: (interceptors[0] as unknown as { _reflector: Reflector })._reflector,
			},
			requestSizeHookParameters: appFactoryDependencies.registerRequestSizeHooks.mock.calls[0]?.[0],
			resolvedProviders: harness.get.mock.calls.map(([token]) => token),
		}).toEqual({
			filterTypes: [HttpExceptionFilter, PrismaExceptionFilter],
			filterTelemetry: [observabilityService, observabilityService],
			httpHookParameters: {
				fastifyInstance: fastifyInstance,
				observabilityService: observabilityService,
			},
			interceptorTypes: [ProductAnalyticsInterceptor, StandardSchemaSerializerInterceptor, ResponseInterceptor],
			productAnalyticsDependencies: {
				observabilityService: observabilityService,
				reflector: reflector,
			},
			requestSizeHookParameters: {
				config: requestSizeConfiguration,
				fastifyInstance: fastifyInstance,
				observabilityService: observabilityService,
			},
			resolvedProviders: [ObservabilityService, Reflector],
		});
	});

	it("should register HTTP telemetry before CORS, security, and request-size hooks", async () => {
		_resetAppFactoryTestDependencies();
		vi.stubEnv("CORS_ORIGINS", "https://mobile.cataqui.test");
		vi.stubEnv("NODE_ENV", "test");
		const requestSizeConfiguration = {
			bodyLimitBytes: 512_000,
			connectionTimeoutMs: 0,
			handlerTimeoutMs: 60_000,
			keepAliveTimeoutMs: 5_000,
			requestTimeoutMs: 10_000,
			urlLengthLimitBytes: 8_000,
		};
		appFactoryDependencies.requestSizeConfig.mockReturnValue(requestSizeConfiguration);
		const registrationOrder: string[] = [];
		appFactoryDependencies.registerHttpObservabilityHooks.mockImplementation(() => {
			registrationOrder.push("HTTP_OBSERVABILITY");
		});
		appFactoryDependencies.registerRequestSizeHooks.mockImplementation(() => {
			registrationOrder.push("REQUEST_SIZE");
		});
		appFactoryDependencies.setupSwagger.mockImplementation(() => {
			registrationOrder.push("SWAGGER");
		});
		const observabilityService = { recordApiError: vi.fn() } as unknown as ObservabilityService;
		const reflector = {} as Reflector;
		const fastifyInstance = {
			register: vi.fn(async (plugin: unknown) => {
				registrationOrder.push(plugin === appFactoryDependencies.helmetPlugin ? "HELMET" : "UNKNOWN_PLUGIN");
			}),
			removeContentTypeParser: vi.fn(),
		};
		const harness = _createAppFactoryHarness({
			fastifyInstance: fastifyInstance,
			observabilityService: observabilityService,
			reflector: reflector,
		});
		harness.enableCors.mockImplementation(() => {
			registrationOrder.push("CORS");
		});

		await configureApp(harness.app);

		expect({
			helmetRegistration: fastifyInstance.register.mock.calls[0],
			registrationOrder: registrationOrder,
		}).toEqual({
			helmetRegistration: [
				appFactoryDependencies.helmetPlugin,
				{
					contentSecurityPolicy: true,
					hsts: { includeSubDomains: true, maxAge: 31_536_000, preload: true },
				},
			],
			registrationOrder: ["HTTP_OBSERVABILITY", "CORS", "HELMET", "REQUEST_SIZE", "SWAGGER"],
		});
	});
});
