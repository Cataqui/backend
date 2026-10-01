import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { InMemorySpanExporter, type ReadableSpan, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

// The SDK must start before Nest and Fastify load, exactly like main.ts, so those modules are imported dynamically.
const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	instrumentations: [new HttpInstrumentation()],
});
sdk.start();

async function _requestFailingRoute(): Promise<ReadableSpan | undefined> {
	const { Controller, Get, Version } = await import("@nestjs/common");
	const { FastifyAdapter } = await import("@nestjs/platform-fastify");
	const { Test } = await import("@nestjs/testing");
	const { configureApp } = await import("../src/core/app.factory");

	@Controller("observability-failure")
	class ObservabilityFailureTestController {
		@Get(":jobId")
		@Version("1")
		fail(): never {
			throw new TypeError("Cannot read properties of undefined (reading 'title')");
		}
	}

	const module = await Test.createTestingModule({ controllers: [ObservabilityFailureTestController] }).compile();
	const app = module.createNestApplication(new FastifyAdapter(), { logger: false });
	await configureApp(app as never);
	await app.listen(0, "127.0.0.1");
	const url = await app.getUrl();

	await fetch(`${url}/v1/observability-failure/7f3c`);
	await app.close();

	return exporter.getFinishedSpans().find((span) => span.kind === SpanKind.SERVER);
}

describe("request error traces (e2e)", () => {
	let serverSpan: ReadableSpan | undefined;

	beforeAll(async () => {
		serverSpan = await _requestFailingRoute();
	});

	afterAll(async () => {
		await sdk.shutdown();
	});

	it("should name the request trace after its route template", () => {
		expect(serverSpan?.name).toBe("GET /v1/observability-failure/:jobId");
	});

	it("should mark the request trace of an unexpected 500 as an error", () => {
		expect(serverSpan?.status.code).toBe(SpanStatusCode.ERROR);
	});

	it("should attach the error type, message, and stack that Datadog Error Tracking needs", () => {
		expect(serverSpan?.events.find((event) => event.name === "exception")?.attributes).toEqual({
			"exception.type": "TypeError",
			"exception.message": "Cannot read properties of undefined (reading 'title')",
			"exception.stacktrace": expect.stringContaining("ObservabilityFailureTestController.fail"),
		});
	});
});
