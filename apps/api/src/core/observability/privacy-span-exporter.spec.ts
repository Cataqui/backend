import { SpanKind, SpanStatusCode, type Attributes } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import fc from "fast-check";
import { PrivacySpanExporter } from "./privacy-span-exporter";

const SPAN_CONTEXT = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: 1 };

function _createSpan(attributes: Attributes): ReadableSpan {
	return {
		name: "GET /v1/feed",
		kind: SpanKind.SERVER,
		spanContext: () => SPAN_CONTEXT,
		startTime: [1, 0],
		endTime: [2, 0],
		status: { code: SpanStatusCode.ERROR, message: "Database unavailable" },
		attributes: attributes,
		links: [],
		events: [{ name: "exception", time: [1, 5], attributes: { "exception.message": "Database unavailable" } }],
		duration: [1, 0],
		ended: true,
		resource: resourceFromAttributes({ "service.name": "cataqui-api" }),
		instrumentationScope: { name: "@opentelemetry/instrumentation-http" },
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
	};
}

function _exportThroughPrivacyFilter(span: ReadableSpan): ReadableSpan {
	const exported: ReadableSpan[] = [];
	const exporter: SpanExporter = {
		export: (spans, resultCallback) => {
			exported.push(...spans);
			resultCallback({ code: ExportResultCode.SUCCESS });
		},
		shutdown: () => Promise.resolve(),
	};

	new PrivacySpanExporter(exporter).export([span], () => undefined);

	return exported[0] as ReadableSpan;
}

describe("PrivacySpanExporter", () => {
	it.each([
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
	])("should never send %s, which identifies the person behind the request", (key) => {
		const span = _exportThroughPrivacyFilter(_createSpan({ [key]: "203.0.113.7" }));

		expect(span.attributes).not.toHaveProperty(key);
	});

	it.each(["http.target", "http.url", "url.full"])("should remove the query string from %s", (key) => {
		const span = _exportThroughPrivacyFilter(_createSpan({ [key]: "https://api.cataqui.com/v1/feed?cursor=secret" }));

		expect(span.attributes[key]).toBe("https://api.cataqui.com/v1/feed");
	});

	it("should never leak any query string value from URL attributes", () => {
		fc.assert(
			fc.property(fc.webPath(), fc.string({ minLength: 1 }), (path, query) => {
				const span = _exportThroughPrivacyFilter(_createSpan({ "url.full": `${path}?${query}` }));

				return !String(span.attributes["url.full"]).includes("?");
			}),
		);
	});

	it("should keep attributes Datadog needs to group requests and errors", () => {
		const attributes = {
			"http.route": "/v1/jobs/:jobId",
			"http.response.status_code": 500,
			"server.address": "example.upstash.io",
		};

		const span = _exportThroughPrivacyFilter(_createSpan(attributes));

		expect(span.attributes).toEqual(attributes);
	});

	it("should keep non-string URL attributes untouched", () => {
		const span = _exportThroughPrivacyFilter(_createSpan({ "http.url": 42 }));

		expect(span.attributes["http.url"]).toBe(42);
	});

	it("should keep exception events so Datadog shows the error message and stack", () => {
		const original = _createSpan({});

		const span = _exportThroughPrivacyFilter(original);

		expect(span.events).toBe(original.events);
	});

	it("should keep the span context so traces stay linked", () => {
		const span = _exportThroughPrivacyFilter(_createSpan({}));

		expect(span.spanContext()).toBe(SPAN_CONTEXT);
	});

	it("should keep the parent span context of child spans", () => {
		const parentSpanContext = { ...SPAN_CONTEXT, spanId: "00f067aa0ba902b7" };

		const span = _exportThroughPrivacyFilter({ ..._createSpan({}), parentSpanContext: parentSpanContext });

		expect(span.parentSpanContext).toBe(parentSpanContext);
	});

	it("should not add a parent span context to root spans", () => {
		const span = _exportThroughPrivacyFilter(_createSpan({}));

		expect(span).not.toHaveProperty("parentSpanContext");
	});

	it("should report the wrapped exporter's result to the SDK", () => {
		const results: ExportResult[] = [];
		const exporter: SpanExporter = {
			export: (_spans, resultCallback) => resultCallback({ code: ExportResultCode.FAILED }),
			shutdown: () => Promise.resolve(),
		};

		new PrivacySpanExporter(exporter).export([_createSpan({})], (result) => results.push(result));

		expect(results).toEqual([{ code: ExportResultCode.FAILED }]);
	});

	it("should shut down the wrapped exporter", async () => {
		const shutdown = vi.fn(() => Promise.resolve());

		await new PrivacySpanExporter({ export: vi.fn(), shutdown: shutdown }).shutdown();

		expect(shutdown).toHaveBeenCalledOnce();
	});

	it("should flush the wrapped exporter", async () => {
		const forceFlush = vi.fn(() => Promise.resolve());

		await new PrivacySpanExporter({ export: vi.fn(), shutdown: vi.fn(), forceFlush: forceFlush }).forceFlush();

		expect(forceFlush).toHaveBeenCalledOnce();
	});

	it("should resolve a flush when the wrapped exporter cannot flush", async () => {
		const flush = new PrivacySpanExporter({ export: vi.fn(), shutdown: vi.fn() }).forceFlush();

		await expect(flush).resolves.toBeUndefined();
	});
});
