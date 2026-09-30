import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import type { FastifyInstance, FastifyRequest } from "fastify";

const _requestSpans = new WeakMap<FastifyRequest, Span>();

/**
 * Names each request trace after its route template, such as `GET /v1/jobs/:jobId`, so Datadog groups requests per
 * endpoint instead of per concrete URL, and remembers the request span so errors can be recorded on it later.
 */
export function registerHttpTelemetryHooks(fastify: FastifyInstance): void {
	fastify.addHook("onRequest", (request, _reply, done) => {
		const span = trace.getActiveSpan();

		if (span !== undefined) {
			const route = request.routeOptions.url;
			if (route !== undefined) {
				span.setAttribute("http.route", route);
				span.updateName(`${request.method} ${route}`);
			}
			_requestSpans.set(request, span);
		}

		done();
	});
}

/** Marks the request trace as failed with the error's type, message, and stack for Datadog Error Tracking. */
export function recordRequestException(request: FastifyRequest, error: Error): void {
	const span = _requestSpans.get(request);
	if (span === undefined) return;

	span.recordException(error);
	span.setStatus({ code: SpanStatusCode.ERROR });
}
