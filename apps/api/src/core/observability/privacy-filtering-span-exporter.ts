import type { Attributes, Link } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter, TimedEvent } from "@opentelemetry/sdk-trace-base";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";

const PROHIBITED_SPAN_ATTRIBUTE_NAMES = new Set([
	"client.address",
	"db.query.text",
	"db.statement",
	"dns.error_message",
	"dns.error_name",
	"error.message",
	"exception.message",
	"exception.stacktrace",
	"http.target",
	"http.url",
	"http.user_agent",
	"http.request.method_original",
	"messaging.message.id",
	"network.peer.address",
	"network.peer.port",
	"network.local.address",
	"network.local.port",
	"net.host.ip",
	"net.host.port",
	"net.peer.ip",
	"net.sock.host.addr",
	"net.sock.host.port",
	"net.sock.peer.addr",
	"rpc.jsonrpc.request_id",
	"server.address",
	"server.port",
	"url.full",
	"url.path",
	"url.query",
	"user_agent.original",
]);

function _isProhibitedSpanAttributeName(params: { attributeName: string }): boolean {
	return (
		PROHIBITED_SPAN_ATTRIBUTE_NAMES.has(params.attributeName) ||
		/^peer(?:\[\d+\])?\.ipv[46]$/.test(params.attributeName) ||
		params.attributeName.startsWith("db.operation.parameter.") ||
		params.attributeName.startsWith("enduser.") ||
		params.attributeName.startsWith("http.request.header.") ||
		params.attributeName.startsWith("http.response.header.")
	);
}

function _filterSpanAttributes(attributes: Attributes | undefined): Attributes | undefined {
	if (attributes === undefined) return undefined;

	return Object.fromEntries(
		Object.entries(attributes).filter(
			([attributeName]) => !_isProhibitedSpanAttributeName({ attributeName: attributeName }),
		),
	);
}

function _filterSpanEvent(event: TimedEvent): TimedEvent {
	const attributes = _filterSpanAttributes(event.attributes);
	if (attributes === undefined) {
		return {
			...event,
			...(event.attributes === undefined ? {} : { attributes: {} }),
		};
	}

	return {
		...event,
		attributes: attributes,
	};
}

function _filterSpanLink(link: Link): Link {
	const attributes = _filterSpanAttributes(link.attributes);
	if (attributes === undefined) return link;

	return {
		...link,
		attributes: attributes,
	};
}

function _filterReadableSpan(span: ReadableSpan): ReadableSpan {
	const attributes = _filterSpanAttributes(span.attributes) ?? {};
	if (
		attributes["cataqui.http.outcome"] === HttpRequestTerminationReason.ABORTED ||
		attributes["cataqui.http.outcome"] === HttpRequestTerminationReason.TIMEOUT
	) {
		delete attributes["http.response.status_code"];
	}

	return {
		attributes: attributes,
		droppedAttributesCount: span.droppedAttributesCount,
		droppedEventsCount: span.droppedEventsCount,
		droppedLinksCount: span.droppedLinksCount,
		duration: span.duration,
		ended: span.ended,
		endTime: span.endTime,
		events: span.events.map(_filterSpanEvent),
		instrumentationScope: span.instrumentationScope,
		kind: span.kind,
		links: span.links.map(_filterSpanLink),
		name: span.name,
		...(span.parentSpanContext === undefined ? {} : { parentSpanContext: span.parentSpanContext }),
		resource: span.resource,
		spanContext: span.spanContext.bind(span),
		startTime: span.startTime,
		status: { code: span.status.code },
	};
}

export class PrivacyFilteringSpanExporter implements SpanExporter {
	private readonly _delegate: SpanExporter;

	constructor(params: { delegate: SpanExporter }) {
		this._delegate = params.delegate;
	}

	export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter["export"]>[1]): void {
		this._delegate.export(spans.map(_filterReadableSpan), resultCallback);
	}

	forceFlush(): Promise<void> {
		return this._delegate.forceFlush?.() ?? Promise.resolve();
	}

	shutdown(): Promise<void> {
		return this._delegate.shutdown();
	}
}
