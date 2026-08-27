import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { PrivacyFilteringSpanExporter } from "./privacy-filtering-span-exporter";

describe("PrivacyFilteringSpanExporter", () => {
	it("should remove customer-identifying request and exception data before export", () => {
		const delegateExport = vi.fn();
		const exporter = new PrivacyFilteringSpanExporter({
			delegate: {
				export: delegateExport,
				shutdown: vi.fn(async () => undefined),
			} as SpanExporter,
		});
		const span = {
			attributes: {
				"cataqui.http.outcome": "TIMEOUT",
				"client.address": "203.0.113.1",
				"dns.error_message": "getaddrinfo ENOTFOUND private-provider.example",
				"dns.error_name": "Error",
				"http.route": "/v1/jobs/:jobId",
				"http.request.method_original": "PRIVATE_METHOD_123",
				"http.response.status_code": 200,
				"network.local.address": "10.0.0.4",
				"network.local.port": 54_321,
				"peer.ipv4": "203.0.113.2",
				"peer[1].ipv6": "2001:db8::1",
				"server.address": "127.0.0.1",
				"server.port": 32_768,
				"url.query": "cursor=customer-data",
				"user_agent.original": "identifying-agent",
			},
			events: [
				{
					attributes: {
						"exception.message": "provider response body",
						"exception.type": "ProviderError",
					},
					name: "exception",
					time: [0, 0],
				},
			],
			kind: SpanKind.SERVER,
			links: [],
			spanContext: () => ({ traceId: "0".repeat(32), spanId: "0".repeat(16), traceFlags: 1 }),
			status: { code: SpanStatusCode.ERROR, message: "raw provider failure" },
		} as unknown as ReadableSpan;

		exporter.export([span], vi.fn());

		const exportedSpan = (delegateExport.mock.calls[0]?.[0] as ReadableSpan[] | undefined)?.[0];
		expect({
			attributes: exportedSpan?.attributes,
			eventAttributes: exportedSpan?.events[0]?.attributes,
			status: exportedSpan?.status,
		}).toEqual({
			attributes: { "cataqui.http.outcome": "TIMEOUT", "http.route": "/v1/jobs/:jobId" },
			eventAttributes: { "exception.type": "ProviderError" },
			status: { code: SpanStatusCode.ERROR },
		});
	});
});
