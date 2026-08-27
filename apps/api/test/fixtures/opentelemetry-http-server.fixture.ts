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

const [{ lookup }, { request: createHttpRequest }, { default: Fastify }, { registerHttpObservabilityHooks }] =
	await Promise.all([
		import("node:dns/promises"),
		import("node:http"),
		import("fastify"),
		import("../../src/core/observability/http-observability.hook"),
	]);
await lookup("localhost", { all: true });
const app = Fastify();
registerHttpObservabilityHooks({
	fastifyInstance: app,
	observabilityService: {
		addActiveHttpRequests: () => undefined,
		recordHttpRequestCompleted: () => undefined,
		recordHttpRequestTerminated: () => undefined,
	} as never,
});
app.get("/v1/jobs/:jobId", async () => ({ ok: true }));

const address = await app.listen({ host: "127.0.0.1", port: 0 });
await fetch(`${address}/v1/jobs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?cursor=private-cursor`, {
	headers: { "x-request-id": "mobile-request-123" },
});
await new Promise<void>((resolve, reject) => {
	const request = createHttpRequest(new URL("/v1/jobs/nonstandard-method", address), {
		method: "PRIVATE_METHOD_123",
	});
	request.on("error", reject);
	request.on("response", (response) => {
		response.resume();
		response.on("end", resolve);
	});
	request.end();
});
await app.close();

const serverSpan = spanExporter.getFinishedSpans().find((span) => span.kind === SpanKind.SERVER);
if (serverSpan === undefined) throw new Error("OpenTelemetry did not produce an HTTP server span.");

process.stdout.write(
	`${JSON.stringify({
		allSpanAttributes: spanExporter.getFinishedSpans().map((span) => span.attributes),
		attributes: serverSpan.attributes,
		name: serverSpan.name,
	})}\n`,
);
await telemetrySdk.shutdown();
