import { trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { InMemoryLogRecordExporter, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { createNodeInstrumentations } from "../../src/core/observability/node-instrumentations";

const logExporter = new InMemoryLogRecordExporter();
const telemetrySdk = new NodeSDK({
	autoDetectResources: false,
	instrumentations: createNodeInstrumentations({ redactSensitiveHttpAttributes: true }),
	logRecordProcessors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
	resource: resourceFromAttributes({
		"deployment.environment.name": "development",
		"service.name": "cataqui-api",
		"service.version": "0123456789abcdef0123456789abcdef01234567",
	}),
	spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
});
telemetrySdk.start();

const { createStructuredLogger } = await import("../../src/core/observability/structured-logger");
const logger = createStructuredLogger({
	environment: "development",
	serviceVersion: "0123456789abcdef0123456789abcdef01234567",
});
trace.getTracer("opentelemetry-pino-log-fixture").startActiveSpan("fixture.operation", (span) => {
	logger.log(
		{
			event: "api.fixture.completed",
			statusCode: 200,
			token: "private-token-value",
		},
		"Fixture",
	);
	span.end();
});

await new Promise((resolve) => setTimeout(resolve, 0));
const exportedLog = logExporter.getFinishedLogRecords()[0];
if (exportedLog === undefined) throw new Error("OpenTelemetry did not receive the structured Pino log record.");

process.stdout.write(
	`${JSON.stringify({
		attributes: exportedLog.attributes,
		body: exportedLog.body,
		resourceAttributes: exportedLog.resource.attributes,
		severityText: exportedLog.severityText,
		spanContext: exportedLog.spanContext,
	})}\n`,
);
await telemetrySdk.shutdown();
