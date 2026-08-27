import { GLOBAL_MODULE_METADATA, MODULE_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";

const observabilityModuleDependencies = vi.hoisted(() => ({
	constructedServiceParameters: [] as unknown[],
	createStructuredLogger: vi.fn(),
	getMeter: vi.fn(),
	getTracer: vi.fn(),
	readObservabilityConfig: vi.fn(),
	reportApplicationLifecycleFailure: vi.fn(),
	shutdownTelemetry: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
	metrics: { getMeter: observabilityModuleDependencies.getMeter },
	trace: { getTracer: observabilityModuleDependencies.getTracer },
}));

vi.mock("./observability.config", () => ({
	readObservabilityConfig: observabilityModuleDependencies.readObservabilityConfig,
}));

vi.mock("./observability.service", () => ({
	ObservabilityService: class TestObservabilityService {
		readonly telemetry: unknown;

		constructor(telemetry: unknown) {
			this.telemetry = telemetry;
			observabilityModuleDependencies.constructedServiceParameters.push(telemetry);
		}
	},
}));

vi.mock("./structured-logger", () => ({
	createStructuredLogger: observabilityModuleDependencies.createStructuredLogger,
	StructuredLogger: class TestStructuredLogger {},
}));

vi.mock("./telemetry", () => ({
	reportApplicationLifecycleFailure: observabilityModuleDependencies.reportApplicationLifecycleFailure,
	shutdownTelemetry: observabilityModuleDependencies.shutdownTelemetry,
}));

import { ObservabilityModule } from "./observability.module";
import { ObservabilityService } from "./observability.service";
import { StructuredLogger } from "./structured-logger";

function _resetObservabilityModuleTestDependencies(): void {
	observabilityModuleDependencies.constructedServiceParameters.length = 0;
	observabilityModuleDependencies.createStructuredLogger.mockReset();
	observabilityModuleDependencies.getMeter.mockReset();
	observabilityModuleDependencies.getTracer.mockReset();
	observabilityModuleDependencies.readObservabilityConfig.mockReset();
	observabilityModuleDependencies.reportApplicationLifecycleFailure.mockReset();
	observabilityModuleDependencies.shutdownTelemetry.mockReset();
}

describe("ObservabilityModule", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should construct request telemetry from the configured service identity", async () => {
		_resetObservabilityModuleTestDependencies();
		observabilityModuleDependencies.readObservabilityConfig.mockReturnValue({
			enabled: true,
			environment: "staging",
			otlpEndpoint: "https://example.test",
			serviceInstanceId: "staging-instance",
			serviceName: "cataqui-api",
			serviceVersion: "service-version-123",
			traceSampleRatio: 0.25,
		});
		const meter = { telemetry: "meter" };
		const tracer = { telemetry: "tracer" };
		observabilityModuleDependencies.getMeter.mockReturnValue(meter);
		observabilityModuleDependencies.getTracer.mockReturnValue(tracer);
		observabilityModuleDependencies.createStructuredLogger.mockReturnValue({ logger: "structured" });
		observabilityModuleDependencies.shutdownTelemetry.mockResolvedValue(undefined);
		const module = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();

		const observabilityService = module.get(ObservabilityService) as unknown as { telemetry: unknown };
		await module.close();

		expect({
			configurationReadsUseProcessEnvironment: observabilityModuleDependencies.readObservabilityConfig.mock.calls.map(
				([params]) => params.environment === process.env,
			),
			meterCall: observabilityModuleDependencies.getMeter.mock.calls[0],
			serviceTelemetry: observabilityService.telemetry,
			tracerCall: observabilityModuleDependencies.getTracer.mock.calls[0],
		}).toEqual({
			configurationReadsUseProcessEnvironment: [true, true],
			meterCall: ["cataqui-api", "service-version-123"],
			serviceTelemetry: { meter: meter, tracer: tracer },
			tracerCall: ["cataqui-api", "service-version-123"],
		});
	});

	it("should construct the application logger from the bounded deployment identity", async () => {
		_resetObservabilityModuleTestDependencies();
		observabilityModuleDependencies.readObservabilityConfig.mockReturnValue({
			enabled: true,
			environment: "production",
			otlpEndpoint: "https://example.test",
			serviceInstanceId: "production-instance",
			serviceName: "cataqui-api",
			serviceVersion: "production-version-456",
			traceSampleRatio: 0.1,
		});
		observabilityModuleDependencies.getMeter.mockReturnValue({ telemetry: "meter" });
		observabilityModuleDependencies.getTracer.mockReturnValue({ telemetry: "tracer" });
		const structuredLogger = { logger: "structured" };
		observabilityModuleDependencies.createStructuredLogger.mockReturnValue(structuredLogger);
		observabilityModuleDependencies.shutdownTelemetry.mockResolvedValue(undefined);
		const module = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();

		const resolvedLogger = module.get(StructuredLogger);
		await module.close();

		expect({
			factoryCall: observabilityModuleDependencies.createStructuredLogger.mock.calls[0],
			resolvedLogger: resolvedLogger,
		}).toEqual({
			factoryCall: [{ environment: "production", serviceVersion: "production-version-456" }],
			resolvedLogger: structuredLogger,
		});
	});

	it("should flush telemetry when the Nest application shuts down", async () => {
		_resetObservabilityModuleTestDependencies();
		observabilityModuleDependencies.readObservabilityConfig.mockReturnValue({
			enabled: false,
			environment: "test",
			otlpEndpoint: "https://example.test",
			serviceInstanceId: "test-instance",
			serviceName: "cataqui-api",
			serviceVersion: "test-version",
			traceSampleRatio: 1,
		});
		observabilityModuleDependencies.getMeter.mockReturnValue({ telemetry: "meter" });
		observabilityModuleDependencies.getTracer.mockReturnValue({ telemetry: "tracer" });
		observabilityModuleDependencies.createStructuredLogger.mockReturnValue({ logger: "structured" });
		observabilityModuleDependencies.shutdownTelemetry.mockResolvedValue(undefined);
		const module = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();
		await module.init();

		await module.close();

		expect(observabilityModuleDependencies.shutdownTelemetry).toHaveBeenCalledOnce();
	});

	it("should report telemetry flush failures without blocking application shutdown", async () => {
		_resetObservabilityModuleTestDependencies();
		vi.stubEnv("NODE_ENV", "staging");
		observabilityModuleDependencies.readObservabilityConfig.mockReturnValue({
			enabled: true,
			environment: "staging",
			otlpEndpoint: "https://example.test",
			serviceInstanceId: "staging-instance",
			serviceName: "cataqui-api",
			serviceVersion: "staging-version",
			traceSampleRatio: 1,
		});
		observabilityModuleDependencies.getMeter.mockReturnValue({ telemetry: "meter" });
		observabilityModuleDependencies.getTracer.mockReturnValue({ telemetry: "tracer" });
		observabilityModuleDependencies.createStructuredLogger.mockReturnValue({ logger: "structured" });
		const shutdownError = new Error("flush failed");
		observabilityModuleDependencies.shutdownTelemetry.mockRejectedValue(shutdownError);
		const module = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();
		await module.init();

		const closeResult = await module.close();

		expect({
			closeResult: closeResult,
			reportCall: observabilityModuleDependencies.reportApplicationLifecycleFailure.mock.calls[0]?.[0],
		}).toEqual({
			closeResult: undefined,
			reportCall: {
				environment: "staging",
				error: shutdownError,
				event: "api.telemetry.shutdown.failed",
			},
		});
	});

	it("should expose both observability providers globally", () => {
		expect({
			exports: Reflect.getMetadata(MODULE_METADATA.EXPORTS, ObservabilityModule),
			global: Reflect.getMetadata(GLOBAL_MODULE_METADATA, ObservabilityModule),
		}).toEqual({ exports: [ObservabilityService, StructuredLogger], global: true });
	});
});
