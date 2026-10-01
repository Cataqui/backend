import type { IncomingMessage } from "node:http";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { AggregationTemporality, AggregationType, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { PrivacySpanExporter } from "./privacy-span-exporter";
import { TelemetryConfigInputSchema } from "./telemetry-config-input.schema";

export const TELEMETRY_SERVICE_NAME = "cataqui-api";

let _sdk: NodeSDK | undefined;

/**
 * Starts OpenTelemetry export to Datadog. Must run before NestJS, Fastify, Prisma, or any HTTP client is imported
 * so their instrumentation can attach. Missing or invalid configuration disables telemetry instead of stopping the API.
 */
export function startTelemetry(): void {
	if (_sdk !== undefined) return;

	const configResult = TelemetryConfigInputSchema.safeParse(process.env);
	if (!configResult.success) {
		if (process.env["NODE_ENV"] === "staging" || process.env["NODE_ENV"] === "production") {
			_writeStderr({
				event: "api.telemetry.disabled",
				level: "warn",
				invalidFields: configResult.error.issues.map((issue) => issue.path.join(".")),
			});
		}
		return;
	}

	const config = configResult.data;
	if (config.NODE_ENV === "test") return;

	const headers = { "dd-api-key": config.DATADOG_API_KEY };

	_sdk = new NodeSDK({
		autoDetectResources: false,
		resource: resourceFromAttributes({
			"service.name": TELEMETRY_SERVICE_NAME,
			"service.version": config.SERVICE_VERSION,
			"deployment.environment.name": config.NODE_ENV,
		}),
		sampler: new AlwaysOnSampler(),
		spanProcessors: [
			new BatchSpanProcessor(
				new PrivacySpanExporter(
					new OTLPTraceExporter({ url: `${config.DATADOG_OTLP_ENDPOINT}/v1/traces`, headers: headers }),
				),
			),
		],
		logRecordProcessors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({ url: `${config.DATADOG_OTLP_ENDPOINT}/v1/logs`, headers: headers }),
			}),
		],
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({
					url: `${config.DATADOG_OTLP_ENDPOINT}/v1/metrics`,
					headers: headers,
					temporalityPreference: AggregationTemporality.DELTA,
				}),
				exportIntervalMillis: 60_000,
			}),
		],
		// Datadog derives request, error, and latency metrics from traces. Dropping the HTTP instrumentation metrics
		// avoids paying for the same numbers twice as custom metrics.
		views: [{ instrumentName: "http.*", aggregation: { type: AggregationType.DROP } }],
		instrumentations: [
			new HttpInstrumentation({
				ignoreIncomingRequestHook: (request: IncomingMessage) => request.url === "/v1/health/live",
			}),
			new UndiciInstrumentation(),
			new NestInstrumentation(),
			new PrismaInstrumentation(),
			new RuntimeNodeInstrumentation(),
		],
	});
	_sdk.start();

	process.once("SIGTERM", () => {
		void _shutdown().finally(() => process.exit(0));
	});
	process.once("uncaughtException", (error) => {
		_writeStderr({ event: "api.process.crashed", level: "fatal", ..._describeError(error) });
		void recordFatalError({ event: "api.process.crashed", error: error }).finally(() => process.exit(1));
	});
}

/** Sends a fatal error to Datadog and flushes everything still buffered, because the process is about to exit. */
export async function recordFatalError(params: { event: string; error: unknown }): Promise<void> {
	if (_sdk === undefined) return;

	const error = _describeError(params.error);
	logs.getLogger(TELEMETRY_SERVICE_NAME).emit({
		severityNumber: SeverityNumber.FATAL,
		severityText: "fatal",
		body: `${params.event}: ${error.errorMessage}`,
		attributes: {
			event: params.event,
			"error.kind": error.errorName,
			"error.message": error.errorMessage,
			...(error.errorStack === undefined ? {} : { "error.stack": error.errorStack }),
		},
	});
	await _shutdown();
}

async function _shutdown(): Promise<void> {
	const sdk = _sdk;
	_sdk = undefined;

	try {
		await sdk?.shutdown();
	} catch (error) {
		_writeStderr({ event: "api.telemetry.shutdown.failed", level: "error", ..._describeError(error) });
	}
}

function _describeError(error: unknown): { errorName: string; errorMessage: string; errorStack?: string } {
	if (!(error instanceof Error)) return { errorName: "UnknownError", errorMessage: String(error) };

	return {
		errorName: error.name,
		errorMessage: error.message,
		...(error.stack === undefined ? {} : { errorStack: error.stack }),
	};
}

function _writeStderr(entry: Record<string, unknown>): void {
	process.stderr.write(`${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`);
}
