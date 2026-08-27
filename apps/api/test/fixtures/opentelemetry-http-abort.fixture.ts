import { SpanKind } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { createNodeInstrumentations } from "../../src/core/observability/node-instrumentations";
import { PrivacyFilteringSpanExporter } from "../../src/core/observability/privacy-filtering-span-exporter";

const spanExporter = new InMemorySpanExporter();
const telemetrySdk = new NodeSDK({
	instrumentations: createNodeInstrumentations({ redactSensitiveHttpAttributes: true }),
	spanProcessors: [
		new SimpleSpanProcessor(
			new PrivacyFilteringSpanExporter({
				delegate: spanExporter,
			}),
		),
	],
});
telemetrySdk.start();

const [{ request: createHttpRequest }, { default: Fastify }, { registerHttpObservabilityHooks }] = await Promise.all([
	import("node:http"),
	import("fastify"),
	import("../../src/core/observability/http-observability.hook"),
]);
let reportHandlerStarted: (() => void) | undefined;
const handlerStarted = new Promise<void>((resolve) => {
	reportHandlerStarted = resolve;
});
let completeHandler: (() => void) | undefined;
const handlerCanComplete = new Promise<void>((resolve) => {
	completeHandler = resolve;
});
let reportRequestTerminated: (() => void) | undefined;
const requestTerminated = new Promise<void>((resolve) => {
	reportRequestTerminated = resolve;
});
const app = Fastify();
registerHttpObservabilityHooks({
	fastifyInstance: app,
	observabilityService: {
		addActiveHttpRequests: () => undefined,
		recordHttpRequestCompleted: () => undefined,
		recordHttpRequestTerminated: () => reportRequestTerminated?.(),
	} as never,
});
app.get("/v1/feed", async () => {
	reportHandlerStarted?.();
	await handlerCanComplete;
	return { ok: true };
});

const endpoint = new URL("/v1/feed", await app.listen({ host: "127.0.0.1", port: 0 }));
const request = createHttpRequest({
	host: endpoint.hostname,
	method: "GET",
	path: endpoint.pathname,
	port: Number(endpoint.port),
});
request.on("error", () => undefined);
request.end();
await handlerStarted;
request.destroy();
await requestTerminated;
completeHandler?.();
await new Promise((resolve) => setTimeout(resolve, 25));
await app.close();

const serverSpan = spanExporter.getFinishedSpans().find((span) => span.kind === SpanKind.SERVER);
if (serverSpan === undefined) throw new Error("OpenTelemetry did not produce an aborted HTTP server span.");

process.stdout.write(
	`${JSON.stringify({
		attributes: serverSpan.attributes,
		name: serverSpan.name,
		status: serverSpan.status,
	})}\n`,
);
await telemetrySdk.shutdown();
