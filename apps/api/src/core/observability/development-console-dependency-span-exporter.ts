import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
	getTelemetryHttpRequestMethod,
	ObservabilityEventConstants,
	TelemetryHttpRequestMethod,
} from "@cataqui/observability-contracts";

enum DevelopmentConsoleDependencyName {
	CLOUDFLARE_AI_GATEWAY = "CLOUDFLARE_AI_GATEWAY",
	OUTBOUND_HTTP = "OUTBOUND_HTTP",
	POSTGRESQL = "POSTGRESQL",
	UPSTASH_REDIS = "UPSTASH_REDIS",
}

function _getStringSpanAttribute(params: { attributeName: string; span: ReadableSpan }): string | undefined {
	const attributeValue = params.span.attributes[params.attributeName];
	return typeof attributeValue === "string" ? attributeValue : undefined;
}

function _getDevelopmentConsoleDependencyName(params: {
	span: ReadableSpan;
}): DevelopmentConsoleDependencyName | undefined {
	if (params.span.instrumentationScope.name === "prisma") {
		return DevelopmentConsoleDependencyName.POSTGRESQL;
	}

	if (params.span.kind !== SpanKind.CLIENT) return undefined;

	const serverAddress = _getStringSpanAttribute({ attributeName: "server.address", span: params.span });
	if (serverAddress === "upstash.io" || serverAddress?.endsWith(".upstash.io") === true) {
		return DevelopmentConsoleDependencyName.UPSTASH_REDIS;
	}
	if (serverAddress === "gateway.ai.cloudflare.com") {
		return DevelopmentConsoleDependencyName.CLOUDFLARE_AI_GATEWAY;
	}

	if (
		params.span.instrumentationScope.name === "@opentelemetry/instrumentation-http" ||
		params.span.instrumentationScope.name === "@opentelemetry/instrumentation-undici"
	) {
		return DevelopmentConsoleDependencyName.OUTBOUND_HTTP;
	}

	return undefined;
}

function _getDevelopmentConsoleOperation(params: {
	dependencyName: DevelopmentConsoleDependencyName;
	span: ReadableSpan;
}): string {
	if (params.dependencyName === DevelopmentConsoleDependencyName.POSTGRESQL) return "DATABASE_QUERY";

	const requestMethod = getTelemetryHttpRequestMethod({
		requestMethod: _getStringSpanAttribute({ attributeName: "http.request.method", span: params.span }) ?? "",
	});
	return `HTTP_${requestMethod === TelemetryHttpRequestMethod.OTHER ? "OTHER" : requestMethod}`;
}

function _getDurationMilliseconds(params: { span: ReadableSpan }): number {
	return Number((params.span.duration[0] * 1_000 + params.span.duration[1] / 1_000_000).toFixed(3));
}

export class DevelopmentConsoleDependencySpanExporter implements SpanExporter {
	private readonly _writeLine: (params: { line: string }) => void;

	constructor(params: { writeLine: (params: { line: string }) => void }) {
		this._writeLine = params.writeLine;
	}

	export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter["export"]>[1]): void {
		for (const span of spans) {
			const dependencyName = _getDevelopmentConsoleDependencyName({ span: span });
			if (dependencyName === undefined) continue;

			this._writeLine({
				line: JSON.stringify({
					attributes: span.attributes,
					dependency: dependencyName,
					durationMilliseconds: _getDurationMilliseconds({ span: span }),
					event: ObservabilityEventConstants.API_DEPENDENCY_COMPLETED_EVENT,
					events: span.events.map((event) => ({
						attributes: event.attributes ?? {},
						name: event.name,
						time: event.time,
					})),
					operation: _getDevelopmentConsoleOperation({ dependencyName: dependencyName, span: span }),
					outcome: span.status.code === SpanStatusCode.ERROR ? "ERROR" : "SUCCESS",
					...(span.parentSpanContext === undefined ? {} : { parent_span_id: span.parentSpanContext.spanId }),
					span_id: span.spanContext().spanId,
					spanName: span.name,
					status: span.status,
					trace_id: span.spanContext().traceId,
				}),
			});
		}

		resultCallback({ code: 0 });
	}

	async shutdown(): Promise<void> {}
}
