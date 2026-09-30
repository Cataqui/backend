import type { Attributes } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

// Client network identity and user agents identify the person behind a request; Datadog never needs them.
const DROPPED_ATTRIBUTE_KEYS = new Set([
	"client.address",
	"client.port",
	"http.client_ip",
	"http.user_agent",
	"net.peer.ip",
	"net.sock.peer.addr",
	"network.peer.address",
	"network.peer.port",
	"url.query",
	"user_agent.original",
]);

// Query strings can carry cursors, search terms, or tokens, so URL-shaped attributes keep only their path.
const URL_ATTRIBUTE_KEYS = new Set(["http.target", "http.url", "url.full"]);

export class PrivacySpanExporter implements SpanExporter {
	constructor(private readonly _exporter: SpanExporter) {}

	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		this._exporter.export(spans.map(_redactSpan), resultCallback);
	}

	shutdown(): Promise<void> {
		return this._exporter.shutdown();
	}

	forceFlush(): Promise<void> {
		return this._exporter.forceFlush?.() ?? Promise.resolve();
	}
}

function _redactSpan(span: ReadableSpan): ReadableSpan {
	return {
		name: span.name,
		kind: span.kind,
		spanContext: () => span.spanContext(),
		...(span.parentSpanContext === undefined ? {} : { parentSpanContext: span.parentSpanContext }),
		startTime: span.startTime,
		endTime: span.endTime,
		status: span.status,
		attributes: _redactAttributes(span.attributes),
		links: span.links,
		events: span.events,
		duration: span.duration,
		ended: span.ended,
		resource: span.resource,
		instrumentationScope: span.instrumentationScope,
		droppedAttributesCount: span.droppedAttributesCount,
		droppedEventsCount: span.droppedEventsCount,
		droppedLinksCount: span.droppedLinksCount,
	};
}

function _redactAttributes(attributes: Attributes): Attributes {
	const redacted: Attributes = {};

	for (const [key, value] of Object.entries(attributes)) {
		if (DROPPED_ATTRIBUTE_KEYS.has(key)) continue;

		redacted[key] = URL_ATTRIBUTE_KEYS.has(key) && typeof value === "string" ? value.split("?", 1)[0] : value;
	}

	return redacted;
}
