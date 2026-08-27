const bootstrapDependencies = vi.hoisted(() => ({
	appModule: class TestAppModule {},
	configureApp: vi.fn(),
	createApp: vi.fn(),
	fastifyAdapterConfigurations: [] as unknown[],
	fastifyAdapters: [] as unknown[],
	loggerContexts: [] as string[],
	loggerEntries: [] as unknown[],
	requestSizeConfig: vi.fn(),
	structuredLogger: class TestStructuredLogger {},
}));

vi.mock("@nestjs/common", () => ({
	Logger: class TestLogger {
		constructor(context: string) {
			bootstrapDependencies.loggerContexts.push(context);
		}

		log(entry: unknown): void {
			bootstrapDependencies.loggerEntries.push(entry);
		}
	},
}));

vi.mock("@nestjs/core", () => ({ NestFactory: { create: bootstrapDependencies.createApp } }));

vi.mock("@nestjs/platform-fastify", () => ({
	FastifyAdapter: class TestFastifyAdapter {
		constructor(configuration: unknown) {
			bootstrapDependencies.fastifyAdapterConfigurations.push(configuration);
			bootstrapDependencies.fastifyAdapters.push(this);
		}
	},
}));

vi.mock("./app.module", () => ({ AppModule: bootstrapDependencies.appModule }));
vi.mock("./core/app.factory", () => ({ configureApp: bootstrapDependencies.configureApp }));
vi.mock("./core/config/request-size.config", () => ({
	requestSizeConfig: bootstrapDependencies.requestSizeConfig,
}));
vi.mock("./core/observability/structured-logger", () => ({
	StructuredLogger: bootstrapDependencies.structuredLogger,
}));

import { AppModule } from "./app.module";
import { bootstrap } from "./bootstrap";
import { StructuredLogger } from "./core/observability/structured-logger";

function _resetBootstrapTestDependencies(): void {
	bootstrapDependencies.configureApp.mockReset();
	bootstrapDependencies.createApp.mockReset();
	bootstrapDependencies.requestSizeConfig.mockReset();
	bootstrapDependencies.fastifyAdapterConfigurations.length = 0;
	bootstrapDependencies.fastifyAdapters.length = 0;
	bootstrapDependencies.loggerContexts.length = 0;
	bootstrapDependencies.loggerEntries.length = 0;
}

describe("bootstrap", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should create Nest with the complete Fastify request-boundary configuration", async () => {
		_resetBootstrapTestDependencies();
		bootstrapDependencies.requestSizeConfig.mockReturnValue({
			bodyLimitBytes: 524_288,
			connectionTimeoutMs: 0,
			handlerTimeoutMs: 60_000,
			keepAliveTimeoutMs: 5_000,
			requestTimeoutMs: 10_000,
			urlLengthLimitBytes: 8_192,
		});
		vi.stubEnv("HOST", "127.0.0.1");
		vi.stubEnv("PORT", "4812");
		const app = {
			enableShutdownHooks: vi.fn(),
			get: vi.fn(() => ({ logger: "structured" })),
			listen: vi.fn(async () => undefined),
			useLogger: vi.fn(),
		};
		bootstrapDependencies.createApp.mockResolvedValue(app);
		bootstrapDependencies.configureApp.mockResolvedValue(undefined);

		await bootstrap();

		expect({
			adapterConfiguration: bootstrapDependencies.fastifyAdapterConfigurations[0],
			createArguments: bootstrapDependencies.createApp.mock.calls[0],
		}).toEqual({
			adapterConfiguration: {
				bodyLimit: 524_288,
				connectionTimeout: 0,
				handlerTimeout: 60_000,
				keepAliveTimeout: 5_000,
				requestTimeout: 10_000,
				trustProxy: true,
			},
			createArguments: [AppModule, bootstrapDependencies.fastifyAdapters[0], { abortOnError: false, bufferLogs: true }],
		});
	});

	it("should install structured logging and shutdown handling before listening and reporting readiness", async () => {
		_resetBootstrapTestDependencies();
		bootstrapDependencies.requestSizeConfig.mockReturnValue({
			bodyLimitBytes: 524_288,
			connectionTimeoutMs: 0,
			handlerTimeoutMs: 60_000,
			keepAliveTimeoutMs: 5_000,
			requestTimeoutMs: 10_000,
			urlLengthLimitBytes: 8_192,
		});
		vi.stubEnv("HOST", "api.internal");
		vi.stubEnv("PORT", "7310");
		const lifecycle: string[] = [];
		const structuredLogger = { logger: "structured" };
		const app = {
			enableShutdownHooks: vi.fn(() => lifecycle.push("ENABLE_SHUTDOWN_HOOKS")),
			get: vi.fn((token: unknown) => {
				lifecycle.push(token === StructuredLogger ? "GET_STRUCTURED_LOGGER" : "GET_UNKNOWN_PROVIDER");
				return structuredLogger;
			}),
			listen: vi.fn(async (port: string | number, host: string) => {
				lifecycle.push(`LISTEN_${host}_${port}`);
			}),
			useLogger: vi.fn((logger: unknown) => {
				lifecycle.push(logger === structuredLogger ? "USE_STRUCTURED_LOGGER" : "USE_UNKNOWN_LOGGER");
			}),
		};
		bootstrapDependencies.createApp.mockResolvedValue(app);
		bootstrapDependencies.configureApp.mockImplementation(async (configuredApp: unknown) => {
			lifecycle.push(configuredApp === app ? "CONFIGURE_APP" : "CONFIGURE_UNKNOWN_APP");
		});

		await bootstrap();

		expect({
			lifecycle: lifecycle,
			loggerContexts: bootstrapDependencies.loggerContexts,
			loggerEntries: bootstrapDependencies.loggerEntries,
		}).toEqual({
			lifecycle: [
				"GET_STRUCTURED_LOGGER",
				"USE_STRUCTURED_LOGGER",
				"ENABLE_SHUTDOWN_HOOKS",
				"CONFIGURE_APP",
				"LISTEN_api.internal_7310",
			],
			loggerContexts: ["Bootstrap"],
			loggerEntries: [
				{ event: "api.application.started", status: "READY" },
				{ event: "api.documentation.available", status: "READY" },
			],
		});
	});
});
