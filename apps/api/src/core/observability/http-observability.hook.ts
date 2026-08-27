import { trace } from "@opentelemetry/api";
import { getTelemetryHttpRequestMethod, ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { Logger } from "@nestjs/common";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { RequestUtils } from "../../shared/utils/request.utils";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { rememberHttpRequestTermination } from "./http-request-termination.store";
import { rememberHttpRouteTelemetry } from "./http-route-telemetry.store";
import type { ObservabilityService } from "./observability.service";

export function registerHttpObservabilityHooks(params: {
	fastifyInstance: FastifyInstance;
	observabilityService: ObservabilityService;
}): void {
	const requestStartedAt = new WeakMap<FastifyRequest, number>();
	const activeRequests = new WeakSet<FastifyRequest>();
	const activeRequestRoutes = new WeakMap<FastifyRequest, string>();
	const logger = new Logger("HTTP");
	const finishActiveRequest = (request: FastifyRequest): boolean => {
		if (!activeRequests.delete(request)) return false;

		params.observabilityService.addActiveHttpRequests({
			delta: -1,
			route: activeRequestRoutes.get(request) ?? "UNMATCHED",
		});
		return true;
	};
	const recordRequestTermination = (request: FastifyRequest, terminationReason: HttpRequestTerminationReason): void => {
		if (!finishActiveRequest(request)) return;
		rememberHttpRequestTermination({ request: request, terminationReason: terminationReason });
		rememberHttpRequestTermination({ request: request.raw, terminationReason: terminationReason });

		const route = RequestUtils.getNormalizedRouteTemplate(request);
		const telemetryHttpRequestMethod = getTelemetryHttpRequestMethod({ requestMethod: request.method });
		rememberHttpRouteTelemetry({ method: telemetryHttpRequestMethod, rawRequest: request.raw, route: route });
		const durationSeconds = (performance.now() - (requestStartedAt.get(request) ?? performance.now())) / 1_000;
		params.observabilityService.recordHttpRequestTerminated({
			durationSeconds: durationSeconds,
			method: telemetryHttpRequestMethod,
			route: route,
			terminationReason: terminationReason,
		});

		logger.warn({
			durationMilliseconds: durationSeconds * 1_000,
			event: ObservabilityEventConstants.API_HTTP_REQUEST_TERMINATED_EVENT,
			method: telemetryHttpRequestMethod,
			outcome: terminationReason,
			requestId: request.headers["x-request-id"],
			route: route,
		});
	};

	params.fastifyInstance.addHook("onRequest", async (request, reply) => {
		const requestId = RequestUtils.getOrCreateRequestId(request);
		const route = RequestUtils.getNormalizedRouteTemplate(request);
		const telemetryHttpRequestMethod = getTelemetryHttpRequestMethod({ requestMethod: request.method });
		reply.header("x-request-id", requestId);
		trace.getActiveSpan()?.setAttribute("cataqui.request.id", requestId);
		rememberHttpRouteTelemetry({ method: telemetryHttpRequestMethod, rawRequest: request.raw, route: route });
		requestStartedAt.set(request, performance.now());
		activeRequests.add(request);
		activeRequestRoutes.set(request, route);
		params.observabilityService.addActiveHttpRequests({ delta: 1, route: route });
	});

	params.fastifyInstance.addHook("onRequestAbort", async (request) => {
		recordRequestTermination(request, HttpRequestTerminationReason.ABORTED);
	});

	params.fastifyInstance.addHook("onTimeout", async (request) => {
		recordRequestTermination(request, HttpRequestTerminationReason.TIMEOUT);
	});

	params.fastifyInstance.addHook("onResponse", async (request, reply) => {
		if (!finishActiveRequest(request)) return;

		const route = RequestUtils.getNormalizedRouteTemplate(request);
		const telemetryHttpRequestMethod = getTelemetryHttpRequestMethod({ requestMethod: request.method });
		rememberHttpRouteTelemetry({ method: telemetryHttpRequestMethod, rawRequest: request.raw, route: route });
		const durationSeconds = (performance.now() - (requestStartedAt.get(request) ?? performance.now())) / 1_000;
		params.observabilityService.recordHttpRequestCompleted({
			durationSeconds: durationSeconds,
			method: telemetryHttpRequestMethod,
			route: route,
			statusCode: reply.statusCode,
		});
		const activeSpan = trace.getActiveSpan();
		activeSpan?.updateName(`${telemetryHttpRequestMethod} ${route}`);
		activeSpan?.setAttributes({ "http.route": route, "url.full": route, "url.path": route });

		logger.log({
			durationMilliseconds: durationSeconds * 1_000,
			event: ObservabilityEventConstants.API_HTTP_REQUEST_COMPLETED_EVENT,
			method: telemetryHttpRequestMethod,
			requestId: request.headers["x-request-id"],
			route: route,
			statusCode: reply.statusCode,
		});
	});
}
