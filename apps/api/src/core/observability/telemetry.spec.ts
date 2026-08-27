const sdkHarness = vi.hoisted(() => ({
	constructor: vi.fn(),
	shutdown: vi.fn(async () => undefined),
	start: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: class {
		constructor(configuration: unknown) {
			sdkHarness.constructor(configuration);
		}

		start(): void {
			sdkHarness.start();
		}

		async shutdown(): Promise<void> {
			await sdkHarness.shutdown();
		}
	},
}));

import { diag, DiagLogLevel } from "@opentelemetry/api";
import { logs, type Logger, SeverityNumber } from "@opentelemetry/api-logs";
import {
	AggregationTemporality,
	DataPointType,
	InstrumentType,
	MeterProvider,
	PeriodicExportingMetricReader,
	type PushMetricExporter,
	type ResourceMetrics,
	type ViewOptions,
} from "@opentelemetry/sdk-metrics";
import { ObservabilityConstants } from "./observability.constants";
import { emitApplicationLifecycleFailureLog, shutdownTelemetry, startTelemetry } from "./telemetry";

function _createValidEnvironment(params: { enabled: boolean }): NodeJS.ProcessEnv {
	return {
		NODE_ENV: "production",
		SERVICE_INSTANCE_ID: "container-instance-1",
		OBSERVABILITY_TRACE_SAMPLE_RATIO: "0.1",
		OTEL_EXPORTER_OTLP_ENDPOINT: "https://cloudflare.integrations.otlp.datadoghq.com",
		OTEL_EXPORTER_OTLP_HEADERS: params.enabled ? `dd-api-key=${"a".repeat(32)}` : "disabled",
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "delta",
		OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
		SERVICE_VERSION: "0123456789abcdef0123456789abcdef01234567",
	};
}

function _createDevelopmentEnvironment(): NodeJS.ProcessEnv {
	return {
		..._createValidEnvironment({ enabled: false }),
		NODE_ENV: "development",
		OBSERVABILITY_TRACE_SAMPLE_RATIO: "1",
		SERVICE_INSTANCE_ID: "local-development",
		SERVICE_VERSION: "local",
	};
}

describe("telemetry lifecycle", () => {
	afterEach(async () => {
		await shutdownTelemetry();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("should emit only safe startup failure fields to the OpenTelemetry log provider", () => {
		const emitLogRecord = vi.fn();
		vi.spyOn(logs, "getLogger").mockReturnValue({
			emit: emitLogRecord,
			enabled: () => true,
		} satisfies Logger);

		emitApplicationLifecycleFailureLog({
			error: new Error("Datadog runtime key secret-value must not be exported"),
			event: "api.application.start.failed",
		});
		const emittedRecord = emitLogRecord.mock.calls[0]?.[0];

		expect({
			emittedRecord: emittedRecord,
			leaksErrorMessage: JSON.stringify(emittedRecord).includes("secret-value"),
		}).toEqual({
			emittedRecord: {
				attributes: {
					errorName: "Error",
					errorStackFrames: expect.stringContaining("telemetry.spec.ts"),
					event: "api.application.start.failed",
				},
				body: "api.application.start.failed",
				eventName: "api.application.start.failed",
				severityNumber: SeverityNumber.FATAL,
				severityText: "fatal",
			},
			leaksErrorMessage: false,
		});
	});

	it("should map telemetry shutdown failures to error severity", () => {
		const emitLogRecord = vi.fn();
		vi.spyOn(logs, "getLogger").mockReturnValue({
			emit: emitLogRecord,
			enabled: () => true,
		} satisfies Logger);

		emitApplicationLifecycleFailureLog({
			error: new Error("Telemetry flush failed"),
			event: "api.telemetry.shutdown.failed",
		});

		expect(emitLogRecord.mock.calls[0]?.[0]).toMatchObject({
			body: "api.telemetry.shutdown.failed",
			eventName: "api.telemetry.shutdown.failed",
			severityNumber: SeverityNumber.ERROR,
			severityText: "error",
		});
	});

	it("should skip lifecycle records when no OpenTelemetry log provider is enabled", () => {
		const emitLogRecord = vi.fn();
		vi.spyOn(logs, "getLogger").mockReturnValue({
			emit: emitLogRecord,
			enabled: () => false,
		} satisfies Logger);

		emitApplicationLifecycleFailureLog({
			error: new Error("Startup failed"),
			event: "api.application.start.failed",
		});

		expect(emitLogRecord).not.toHaveBeenCalled();
	});

	it("should preserve the stderr failure boundary when the telemetry log provider itself fails", () => {
		vi.spyOn(logs, "getLogger").mockImplementation(() => {
			throw new Error("Telemetry logger unavailable");
		});

		expect(() =>
			emitApplicationLifecycleFailureLog({
				error: new Error("Startup failed"),
				event: "api.application.start.failed",
			}),
		).not.toThrow();
	});

	it("should not initialize exporters before the Datadog runtime account is attached", () => {
		const started = startTelemetry({ environment: _createValidEnvironment({ enabled: false }) });

		expect({ sdkConstructed: sdkHarness.constructor.mock.calls.length, started: started }).toEqual({
			sdkConstructed: 0,
			started: false,
		});
	});

	it("should initialize dependency timing spans for the development console without Datadog", () => {
		const started = startTelemetry({ environment: _createDevelopmentEnvironment() });
		const sdkConfiguration = sdkHarness.constructor.mock.calls[0]?.[0] as
			| { logRecordProcessors?: unknown[]; metricReaders?: unknown[]; spanProcessors?: unknown[] }
			| undefined;

		expect({
			logRecordProcessorCount: sdkConfiguration?.logRecordProcessors?.length ?? 0,
			metricReaderCount: sdkConfiguration?.metricReaders?.length ?? 0,
			sdkStarted: sdkHarness.start.mock.calls.length,
			spanProcessorCount: sdkConfiguration?.spanProcessors?.length ?? 0,
			started: started,
		}).toEqual({
			logRecordProcessorCount: 0,
			metricReaderCount: 0,
			sdkStarted: 1,
			spanProcessorCount: 1,
			started: true,
		});
	});

	it("should initialize every telemetry signal when the runtime API key is attached", () => {
		const setDiagnosticLogger = vi.spyOn(diag, "setLogger");
		const started = startTelemetry({ environment: _createValidEnvironment({ enabled: true }) });

		expect({
			diagnosticLoggerCall: setDiagnosticLogger.mock.calls[0],
			sdkStarted: sdkHarness.start.mock.calls.length,
			started: started,
		}).toEqual({
			diagnosticLoggerCall: [expect.any(Object), { logLevel: DiagLogLevel.WARN, suppressOverrideMessage: true }],
			sdkStarted: 1,
			started: true,
		});
	});

	it("should initialize the telemetry SDK only once", () => {
		const environment = _createValidEnvironment({ enabled: true });
		startTelemetry({ environment: environment });
		startTelemetry({ environment: environment });

		expect(sdkHarness.start).toHaveBeenCalledTimes(1);
	});

	it("should flush telemetry during application shutdown", async () => {
		startTelemetry({ environment: _createValidEnvironment({ enabled: true }) });

		await shutdownTelemetry();

		expect(sdkHarness.shutdown).toHaveBeenCalledTimes(1);
	});

	it("should export direct-ingest metrics without cumulative sums or histograms", async () => {
		startTelemetry({ environment: _createValidEnvironment({ enabled: true }) });
		const sdkConfiguration = sdkHarness.constructor.mock.calls[0]?.[0] as { views?: ViewOptions[] } | undefined;
		if (sdkConfiguration?.views === undefined) throw new Error("The telemetry SDK did not configure metric views.");

		const exportedResourceMetrics: ResourceMetrics[] = [];
		const exporter: PushMetricExporter = {
			export: (resourceMetrics, resultCallback) => {
				exportedResourceMetrics.push(resourceMetrics);
				resultCallback({ code: 0 });
			},
			forceFlush: async () => undefined,
			selectAggregationTemporality: (instrumentType) => {
				switch (instrumentType) {
					case InstrumentType.UP_DOWN_COUNTER:
					case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
						return AggregationTemporality.CUMULATIVE;
					case InstrumentType.COUNTER:
					case InstrumentType.GAUGE:
					case InstrumentType.HISTOGRAM:
					case InstrumentType.OBSERVABLE_COUNTER:
					case InstrumentType.OBSERVABLE_GAUGE:
						return AggregationTemporality.DELTA;
				}
			},
			shutdown: async () => undefined,
		};
		const metricReader = new PeriodicExportingMetricReader({
			exporter: exporter,
			exportIntervalMillis: 3_600_000,
		});
		const meterProvider = new MeterProvider({ readers: [metricReader], views: sdkConfiguration.views });
		const meter = meterProvider.getMeter("telemetry-contract-spec");
		meter.createCounter(ObservabilityConstants.HTTP_REQUEST_COUNT_METRIC_NAME).add(1);
		meter.createHistogram(ObservabilityConstants.HTTP_REQUEST_DURATION_METRIC_NAME).record(0.25);
		meter.createHistogram("http.client.request.duration").record(0.5, {
			"error.type": "connect ECONNREFUSED 127.0.0.1:45678",
			"http.request.method": "GET",
			"http.response.status_code": 503,
			"server.address": "127.0.0.1",
			"server.port": 45_678,
			"url.full": "http://127.0.0.1:45678/private?token=secret",
		});
		meter.createHistogram("http.server.request.duration").record(0.75, {
			"client.address": "203.0.113.10",
			"http.request.method": "POST",
			"http.response.status_code": 201,
			"http.route": "/v1/jobs/drafts",
			"server.address": "127.0.0.1",
			"server.port": 8_080,
			"url.query": "token=secret",
		});
		meter
			.createObservableGauge(ObservabilityConstants.HTTP_ACTIVE_REQUESTS_METRIC_NAME)
			.addCallback((observation) => observation.observe(1));
		meter
			.createObservableUpDownCounter("v8js.memory.heap.space.size")
			.addCallback((observation) => observation.observe(1_024, { "v8js.heap.space.name": "old_space" }));

		await meterProvider.forceFlush();
		const exportedMetrics = exportedResourceMetrics.flatMap((resourceMetrics) =>
			resourceMetrics.scopeMetrics.flatMap((scopeMetrics) => scopeMetrics.metrics),
		);
		const exportedMetricContracts = exportedMetrics.map((metric) => ({
			dataPointType: metric.dataPointType,
			name: metric.descriptor.name,
			temporality: metric.aggregationTemporality,
		}));

		expect({
			clientAttributes: exportedMetrics.find((metric) => metric.descriptor.name === "http.client.request.duration")
				?.dataPoints[0]?.attributes,
			deltaTemporalities: exportedMetricContracts
				.filter(
					(metric) =>
						metric.dataPointType === DataPointType.SUM ||
						metric.dataPointType === DataPointType.HISTOGRAM ||
						metric.dataPointType === DataPointType.EXPONENTIAL_HISTOGRAM,
				)
				.map((metric) => metric.temporality),
			exportedMetricContracts: exportedMetricContracts,
			serverAttributes: exportedMetrics.find((metric) => metric.descriptor.name === "http.server.request.duration")
				?.dataPoints[0]?.attributes,
		}).toEqual({
			clientAttributes: {
				"http.request.method": "GET",
				"http.response.status_code": 503,
			},
			deltaTemporalities: [
				AggregationTemporality.DELTA,
				AggregationTemporality.DELTA,
				AggregationTemporality.DELTA,
				AggregationTemporality.DELTA,
			],
			exportedMetricContracts: expect.arrayContaining([
				{
					dataPointType: DataPointType.GAUGE,
					name: ObservabilityConstants.HTTP_ACTIVE_REQUESTS_METRIC_NAME,
					temporality: expect.any(Number),
				},
				{
					dataPointType: DataPointType.GAUGE,
					name: "v8js.memory.heap.space.size",
					temporality: expect.any(Number),
				},
			]),
			serverAttributes: {
				"http.request.method": "POST",
				"http.route": "/v1/jobs/drafts",
			},
		});

		await meterProvider.shutdown();
	});
});
