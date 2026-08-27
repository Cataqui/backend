import { diag, DiagLogLevel } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import {
	AggregationType,
	AggregationTemporality,
	createAllowListAttributesProcessor,
	PeriodicExportingMetricReader,
	type ViewOptions,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
	BatchSpanProcessor,
	ParentBasedSampler,
	SimpleSpanProcessor,
	TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { DevelopmentConsoleDependencySpanExporter } from "./development-console-dependency-span-exporter";
import { createNodeInstrumentations } from "./node-instrumentations";
import { readObservabilityConfig } from "./observability.config";
import { createOpenTelemetryDiagnosticLogger } from "./opentelemetry-diagnostic-logger";
import { ObservabilityConstants } from "./observability.constants";
import { PrivacyFilteringSpanExporter } from "./privacy-filtering-span-exporter";
import { getDevelopmentErrorLogFields, getSafeErrorTelemetryFields } from "./safe-error-telemetry";

let _telemetrySdk: NodeSDK | undefined;

type ApplicationLifecycleFailureEvent =
	| typeof ObservabilityEventConstants.API_APPLICATION_START_FAILED_EVENT
	| typeof ObservabilityEventConstants.API_TELEMETRY_SHUTDOWN_FAILED_EVENT;

export function emitApplicationLifecycleFailureLog(params: {
	error: unknown;
	event: ApplicationLifecycleFailureEvent;
}): void {
	try {
		const severityByEvent = {
			[ObservabilityEventConstants.API_APPLICATION_START_FAILED_EVENT]: {
				severityNumber: SeverityNumber.FATAL,
				severityText: "fatal",
			},
			[ObservabilityEventConstants.API_TELEMETRY_SHUTDOWN_FAILED_EVENT]: {
				severityNumber: SeverityNumber.ERROR,
				severityText: "error",
			},
		} satisfies Record<typeof params.event, { severityNumber: SeverityNumber; severityText: string }>;
		const severity = severityByEvent[params.event];
		const telemetryLogger = logs.getLogger(ObservabilityConstants.SERVICE_NAME);
		if (!telemetryLogger.enabled({ eventName: params.event, severityNumber: severity.severityNumber })) return;

		telemetryLogger.emit({
			attributes: {
				event: params.event,
				...getSafeErrorTelemetryFields({ error: params.error }),
			},
			body: params.event,
			eventName: params.event,
			severityNumber: severity.severityNumber,
			severityText: severity.severityText,
		});
	} catch {
		// Lifecycle telemetry must never replace the startup or shutdown failure handled by the stderr fallback.
	}
}

export function reportApplicationLifecycleFailure(params: {
	environment: string;
	error: unknown;
	event: ApplicationLifecycleFailureEvent;
}): void {
	emitApplicationLifecycleFailureLog({ error: params.error, event: params.event });
	process.stderr.write(
		`${JSON.stringify({
			environment: params.environment,
			event: params.event,
			level: params.event === ObservabilityEventConstants.API_APPLICATION_START_FAILED_EVENT ? "fatal" : "error",
			timestamp: new Date().toISOString(),
			...getSafeErrorTelemetryFields({ error: params.error }),
			...(params.environment === "development" ? getDevelopmentErrorLogFields({ error: params.error }) : {}),
		})}\n`,
	);
}

function _createMetricViews(): ViewOptions[] {
	return [
		{
			aggregationCardinalityLimit: 500,
			attributesProcessors: [
				createAllowListAttributesProcessor([
					"availability_outcome",
					"http_route",
					"outcome",
					"request_method",
					"status_class",
					"status_code",
					"traffic_surface",
				]),
			],
			instrumentName: ObservabilityConstants.HTTP_REQUEST_COUNT_METRIC_NAME,
		},
		{
			aggregation: {
				options: { boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
				type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
			},
			aggregationCardinalityLimit: 500,
			attributesProcessors: [
				createAllowListAttributesProcessor([
					"availability_outcome",
					"http_route",
					"outcome",
					"request_method",
					"status_class",
					"status_code",
					"traffic_surface",
				]),
			],
			instrumentName: ObservabilityConstants.HTTP_REQUEST_DURATION_METRIC_NAME,
		},
		{
			aggregation: {
				options: { boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] },
				type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
			},
			aggregationCardinalityLimit: 64,
			attributesProcessors: [createAllowListAttributesProcessor(["http.request.method", "http.response.status_code"])],
			instrumentName: "http.client.request.duration",
		},
		{
			aggregation: {
				options: { boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] },
				type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
			},
			aggregationCardinalityLimit: 256,
			attributesProcessors: [createAllowListAttributesProcessor(["http.request.method", "http.route"])],
			instrumentName: "http.server.request.duration",
		},
		{
			aggregationCardinalityLimit: 500,
			attributesProcessors: [createAllowListAttributesProcessor(["http_route", "traffic_surface"])],
			instrumentName: ObservabilityConstants.HTTP_ACTIVE_REQUESTS_METRIC_NAME,
		},
		{
			aggregation: { type: AggregationType.LAST_VALUE },
			aggregationCardinalityLimit: 32,
			attributesProcessors: [createAllowListAttributesProcessor(["v8js.heap.space.name"])],
			instrumentName: "v8js.memory.heap.space.size",
		},
		{
			aggregationCardinalityLimit: 500,
			attributesProcessors: [
				createAllowListAttributesProcessor([
					"error_code",
					"error_origin",
					"http_route",
					"request_method",
					"status_class",
					"status_code",
					"traffic_surface",
				]),
			],
			instrumentName: ObservabilityConstants.API_ERROR_COUNT_METRIC_NAME,
		},
		{
			aggregationCardinalityLimit: 100,
			attributesProcessors: [createAllowListAttributesProcessor(["product_event"])],
			instrumentName: ObservabilityConstants.PRODUCT_EVENT_COUNT_METRIC_NAME,
		},
		{
			aggregationCardinalityLimit: 100,
			attributesProcessors: [createAllowListAttributesProcessor(["operation_name", "outcome"])],
			instrumentName: ObservabilityConstants.OPERATION_COUNT_METRIC_NAME,
		},
		{
			aggregation: {
				options: { boundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60] },
				type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
			},
			aggregationCardinalityLimit: 100,
			attributesProcessors: [createAllowListAttributesProcessor(["operation_name", "outcome"])],
			instrumentName: ObservabilityConstants.OPERATION_DURATION_METRIC_NAME,
		},
	];
}

function _createTelemetrySdk(params: {
	datadogApiKey: string;
	environment: "development" | "production" | "staging" | "test";
	otlpEndpoint: string;
	serviceInstanceId: string;
	serviceName: string;
	serviceVersion: string;
	traceSampleRatio: number;
}): NodeSDK {
	return new NodeSDK({
		autoDetectResources: false,
		instrumentations: createNodeInstrumentations({ redactSensitiveHttpAttributes: true }),
		logRecordProcessors: [
			new BatchLogRecordProcessor({
				exportTimeoutMillis: 10_000,
				exporter: new OTLPLogExporter({
					headers: { "dd-api-key": params.datadogApiKey },
					url: `${params.otlpEndpoint}/v1/logs`,
				}),
				maxExportBatchSize: 512,
				maxQueueSize: 2_048,
				scheduledDelayMillis: 5_000,
			}),
		],
		metricReaders: [
			new PeriodicExportingMetricReader({
				cardinalityLimits: { default: 500 },
				exporter: new OTLPMetricExporter({
					headers: {
						"dd-api-key": params.datadogApiKey,
						"dd-otel-metric-config": JSON.stringify({
							histograms: { mode: "distributions", send_aggregation_metrics: false },
							instrumentation_scope_metadata_as_tags: false,
							resource_attributes_as_tags: true,
						}),
					},
					temporalityPreference: AggregationTemporality.DELTA,
					url: `${params.otlpEndpoint}/v1/metrics`,
				}),
				exportIntervalMillis: 60_000,
				exportTimeoutMillis: 10_000,
				maxExportBatchSize: 512,
			}),
		],
		resource: resourceFromAttributes({
			"deployment.environment.name": params.environment,
			"service.instance.id": params.serviceInstanceId,
			"service.name": params.serviceName,
			"service.namespace": "cataqui",
			"service.version": params.serviceVersion,
		}),
		sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(params.traceSampleRatio) }),
		spanProcessors: [
			new BatchSpanProcessor(
				new PrivacyFilteringSpanExporter({
					delegate: new OTLPTraceExporter({
						headers: { compute_stats: "true", "dd-api-key": params.datadogApiKey },
						url: `${params.otlpEndpoint}/v1/traces`,
					}),
				}),
				{
					exportTimeoutMillis: 10_000,
					maxExportBatchSize: 512,
					maxQueueSize: 2_048,
					scheduledDelayMillis: 5_000,
				},
			),
		],
		views: _createMetricViews(),
	});
}

function _createDevelopmentConsoleTelemetrySdk(params: {
	environment: "development";
	serviceInstanceId: string;
	serviceName: string;
	serviceVersion: string;
	traceSampleRatio: number;
}): NodeSDK {
	return new NodeSDK({
		autoDetectResources: false,
		instrumentations: createNodeInstrumentations({ redactSensitiveHttpAttributes: false }),
		resource: resourceFromAttributes({
			"deployment.environment.name": params.environment,
			"service.instance.id": params.serviceInstanceId,
			"service.name": params.serviceName,
			"service.namespace": "cataqui",
			"service.version": params.serviceVersion,
		}),
		sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(params.traceSampleRatio) }),
		spanProcessors: [
			new SimpleSpanProcessor(
				new DevelopmentConsoleDependencySpanExporter({
					writeLine: ({ line }) => process.stdout.write(`${line}\n`),
				}),
			),
		],
	});
}

export function startTelemetry(params: { environment: NodeJS.ProcessEnv }): boolean {
	if (_telemetrySdk !== undefined) return true;

	const config = readObservabilityConfig({ environment: params.environment });
	if (!config.enabled) {
		if (config.environment !== "development") return false;

		const telemetrySdk = _createDevelopmentConsoleTelemetrySdk({
			environment: config.environment,
			serviceInstanceId: config.serviceInstanceId,
			serviceName: config.serviceName,
			serviceVersion: config.serviceVersion,
			traceSampleRatio: config.traceSampleRatio,
		});
		telemetrySdk.start();
		_telemetrySdk = telemetrySdk;
		return true;
	}
	const exporterHeaders = params.environment["OTEL_EXPORTER_OTLP_HEADERS"];
	if (exporterHeaders === undefined || !exporterHeaders.startsWith("dd-api-key=")) {
		throw new Error("OTEL_EXPORTER_OTLP_HEADERS must contain the validated Datadog runtime API key");
	}

	diag.setLogger(createOpenTelemetryDiagnosticLogger(), {
		logLevel: DiagLogLevel.WARN,
		suppressOverrideMessage: true,
	});
	try {
		const telemetrySdk = _createTelemetrySdk({
			datadogApiKey: exporterHeaders.slice("dd-api-key=".length),
			environment: config.environment,
			otlpEndpoint: config.otlpEndpoint,
			serviceInstanceId: config.serviceInstanceId,
			serviceName: config.serviceName,
			serviceVersion: config.serviceVersion,
			traceSampleRatio: config.traceSampleRatio,
		});
		telemetrySdk.start();
		_telemetrySdk = telemetrySdk;
		return true;
	} catch (error: unknown) {
		diag.disable();
		throw error;
	}
}

export async function shutdownTelemetry(): Promise<void> {
	if (_telemetrySdk === undefined) return;

	const telemetrySdk = _telemetrySdk;
	_telemetrySdk = undefined;
	try {
		await telemetrySdk.shutdown();
	} finally {
		diag.disable();
	}
}
