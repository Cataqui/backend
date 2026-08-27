import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { DevelopmentConsoleDependencySpanExporter } from "./development-console-dependency-span-exporter";

function _createReadableSpan(params: {
	attributes?: Record<string, string>;
	durationMilliseconds: number;
	instrumentationScopeName: string;
	kind: SpanKind;
	statusCode?: SpanStatusCode;
}): ReadableSpan {
	const durationSeconds = Math.floor(params.durationMilliseconds / 1_000);
	const durationNanoseconds = Math.round((params.durationMilliseconds - durationSeconds * 1_000) * 1_000_000);

	return {
		attributes: params.attributes ?? {},
		duration: [durationSeconds, durationNanoseconds],
		events: [{ attributes: { "exception.message": "development-only details" }, name: "exception", time: [1, 2] }],
		instrumentationScope: { name: params.instrumentationScopeName },
		kind: params.kind,
		name: "dependency span",
		parentSpanContext: { spanId: "2".repeat(16), traceFlags: 1, traceId: "1".repeat(32) },
		spanContext: () => ({ spanId: "4".repeat(16), traceFlags: 1, traceId: "3".repeat(32) }),
		status: { code: params.statusCode ?? SpanStatusCode.OK },
	} as unknown as ReadableSpan;
}

describe("DevelopmentConsoleDependencySpanExporter", () => {
	it.each([
		{
			attributes: { "db.operation.name": "findMany", "db.query.text": "SELECT private_data" },
			dependency: "POSTGRESQL",
			instrumentationScopeName: "prisma",
			operation: "DATABASE_QUERY",
		},
		{
			attributes: {
				"http.request.method": "POST",
				"server.address": "cataqui-production.upstash.io",
				"url.full": "https://cataqui-production.upstash.io/private-key",
			},
			dependency: "UPSTASH_REDIS",
			instrumentationScopeName: "@opentelemetry/instrumentation-undici",
			operation: "HTTP_POST",
		},
		{
			attributes: {
				"http.request.method": "POST",
				"server.address": "gateway.ai.cloudflare.com",
			},
			dependency: "CLOUDFLARE_AI_GATEWAY",
			instrumentationScopeName: "@opentelemetry/instrumentation-undici",
			operation: "HTTP_POST",
		},
		{
			attributes: { "http.request.method": "GET", "server.address": "provider.example" },
			dependency: "OUTBOUND_HTTP",
			instrumentationScopeName: "@opentelemetry/instrumentation-http",
			operation: "HTTP_GET",
		},
	])("should print a complete development-only $dependency dependency breakdown", (testCase) => {
		const writtenLines: string[] = [];
		const exporter = new DevelopmentConsoleDependencySpanExporter({
			writeLine: ({ line }) => writtenLines.push(line),
		});

		exporter.export(
			[
				_createReadableSpan({
					attributes: testCase.attributes,
					durationMilliseconds: 42.75,
					instrumentationScopeName: testCase.instrumentationScopeName,
					kind: SpanKind.CLIENT,
					statusCode: SpanStatusCode.OK,
				}),
			],
			vi.fn(),
		);

		expect({
			includesDevelopmentOnlyAttributes: writtenLines[0]?.includes("private") ?? false,
			writtenRecords: writtenLines.map((line) => JSON.parse(line)),
		}).toEqual({
			includesDevelopmentOnlyAttributes: Object.values(testCase.attributes).some((value) => value.includes("private")),
			writtenRecords: [
				{
					attributes: testCase.attributes,
					dependency: testCase.dependency,
					durationMilliseconds: 42.75,
					event: "api.dependency.completed",
					events: [
						{
							attributes: { "exception.message": "development-only details" },
							name: "exception",
							time: [1, 2],
						},
					],
					operation: testCase.operation,
					outcome: "SUCCESS",
					parent_span_id: "2".repeat(16),
					span_id: "4".repeat(16),
					spanName: "dependency span",
					status: { code: SpanStatusCode.OK },
					trace_id: "3".repeat(32),
				},
			],
		});
	});

	it("should print failures and normalize unsupported HTTP methods", () => {
		const writtenLines: string[] = [];
		const exporter = new DevelopmentConsoleDependencySpanExporter({
			writeLine: ({ line }) => writtenLines.push(line),
		});

		exporter.export(
			[
				_createReadableSpan({
					attributes: { "http.request.method": "CUSTOM", "server.address": "provider.example" },
					durationMilliseconds: 10,
					instrumentationScopeName: "@opentelemetry/instrumentation-undici",
					kind: SpanKind.CLIENT,
					statusCode: SpanStatusCode.ERROR,
				}),
			],
			vi.fn(),
		);

		expect(JSON.parse(writtenLines[0] ?? "")).toMatchObject({ operation: "HTTP_OTHER", outcome: "ERROR" });
	});

	it("should ignore inbound HTTP and internal runtime spans", () => {
		const writeLine = vi.fn();
		const exporter = new DevelopmentConsoleDependencySpanExporter({ writeLine: writeLine });

		exporter.export(
			[
				_createReadableSpan({
					durationMilliseconds: 15,
					instrumentationScopeName: "@opentelemetry/instrumentation-http",
					kind: SpanKind.SERVER,
				}),
				_createReadableSpan({
					durationMilliseconds: 5,
					instrumentationScopeName: "@opentelemetry/instrumentation-runtime-node",
					kind: SpanKind.INTERNAL,
				}),
			],
			vi.fn(),
		);

		expect(writeLine).not.toHaveBeenCalled();
	});
});
