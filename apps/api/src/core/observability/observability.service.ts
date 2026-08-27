import {
	type Attributes,
	type Counter,
	type Histogram,
	type Meter,
	type Tracer,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import { inboundReceiverPathPrefix } from "@cataqui/api-internal-ingress";
import { getTelemetryHttpRequestMethod } from "@cataqui/observability-contracts";
import { ApiErrorOrigin } from "./api-error-origin.enum";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { HttpTrafficSurface } from "./http-traffic-surface.enum";
import { ObservabilityOperationName } from "./observability-operation-name.enum";
import { ObservabilityConstants } from "./observability.constants";
import { ProductAnalyticsEventName } from "./product-analytics-event-name.enum";
import { getSafeErrorTelemetryFields } from "./safe-error-telemetry";

function _getHttpTrafficSurface(params: { route: string }): HttpTrafficSurface {
	if (params.route === "UNMATCHED") return HttpTrafficSurface.UNMATCHED;
	if (params.route === "/v1/health" || params.route === "/v1/health/live") return HttpTrafficSurface.HEALTH;
	if (params.route.startsWith(`/${inboundReceiverPathPrefix}/`)) return HttpTrafficSurface.INTERNAL_INBOUND;

	return HttpTrafficSurface.PUBLIC_API;
}

export class ObservabilityService {
	private readonly _activeHttpRequestCountByRoute = new Map<string, number>();
	private readonly _httpRequestCount: Counter;
	private readonly _httpRequestDuration: Histogram;
	private readonly _apiErrorCount: Counter;
	private readonly _productEventCount: Counter;
	private readonly _operationCount: Counter;
	private readonly _operationDuration: Histogram;
	private readonly _tracer: Tracer;

	constructor(params: { meter: Meter; tracer: Tracer }) {
		this._httpRequestCount = params.meter.createCounter(ObservabilityConstants.HTTP_REQUEST_COUNT_METRIC_NAME, {
			description: "Number of terminal API HTTP request outcomes",
		});
		this._httpRequestDuration = params.meter.createHistogram(ObservabilityConstants.HTTP_REQUEST_DURATION_METRIC_NAME, {
			description: "Terminal API HTTP request duration in seconds",
			unit: "s",
		});
		const activeHttpRequests = params.meter.createObservableGauge(
			ObservabilityConstants.HTTP_ACTIVE_REQUESTS_METRIC_NAME,
			{
				description: "Number of API HTTP requests currently in flight",
			},
		);
		activeHttpRequests.addCallback((result) => {
			for (const [route, activeRequestCount] of this._activeHttpRequestCountByRoute) {
				result.observe(activeRequestCount, {
					http_route: route,
					traffic_surface: _getHttpTrafficSurface({ route: route }),
				});
			}
		});
		this._apiErrorCount = params.meter.createCounter(ObservabilityConstants.API_ERROR_COUNT_METRIC_NAME, {
			description: "Number of typed API errors returned to clients",
		});
		this._productEventCount = params.meter.createCounter(ObservabilityConstants.PRODUCT_EVENT_COUNT_METRIC_NAME, {
			description: "Number of successful bounded product API request outcomes",
		});
		this._operationCount = params.meter.createCounter(ObservabilityConstants.OPERATION_COUNT_METRIC_NAME, {
			description: "Number of completed important backend operations",
		});
		this._operationDuration = params.meter.createHistogram(ObservabilityConstants.OPERATION_DURATION_METRIC_NAME, {
			description: "Important backend operation duration in seconds",
			unit: "s",
		});
		this._tracer = params.tracer;
	}

	recordHttpRequestCompleted(params: {
		durationSeconds: number;
		method: string;
		route: string;
		statusCode: number;
	}): void {
		this._recordHttpRequestFinished({
			availabilityOutcome: params.statusCode < 500 ? "GOOD" : "BAD",
			durationSeconds: params.durationSeconds,
			method: params.method,
			outcome: params.statusCode < 400 ? "SUCCESS" : "ERROR",
			route: params.route,
			statusClass: `${Math.floor(params.statusCode / 100)}XX`,
			statusCode: String(params.statusCode),
		});
	}

	recordHttpRequestTerminated(params: {
		durationSeconds: number;
		method: string;
		route: string;
		terminationReason: HttpRequestTerminationReason;
	}): void {
		this._recordHttpRequestFinished({
			availabilityOutcome: params.terminationReason === HttpRequestTerminationReason.ABORTED ? "EXCLUDED" : "BAD",
			durationSeconds: params.durationSeconds,
			method: params.method,
			outcome: params.terminationReason,
			route: params.route,
			statusClass: "NO_RESPONSE",
			statusCode: "NO_RESPONSE",
		});
	}

	private _recordHttpRequestFinished(params: {
		availabilityOutcome: "BAD" | "EXCLUDED" | "GOOD";
		durationSeconds: number;
		method: string;
		outcome: "ERROR" | "SUCCESS" | HttpRequestTerminationReason;
		route: string;
		statusClass: string;
		statusCode: string;
	}): void {
		const attributes: Attributes = {
			availability_outcome: params.availabilityOutcome,
			http_route: params.route,
			outcome: params.outcome,
			request_method: getTelemetryHttpRequestMethod({ requestMethod: params.method }),
			status_class: params.statusClass,
			status_code: params.statusCode,
			traffic_surface: _getHttpTrafficSurface({ route: params.route }),
		};
		this._httpRequestCount.add(1, attributes);
		this._httpRequestDuration.record(params.durationSeconds, attributes);
	}

	addActiveHttpRequests(params: { delta: -1 | 1; route: string }): void {
		this._activeHttpRequestCountByRoute.set(
			params.route,
			Math.max(0, (this._activeHttpRequestCountByRoute.get(params.route) ?? 0) + params.delta),
		);
	}

	recordApiError(params: {
		errorCode: string;
		exception?: unknown;
		method: string;
		origin: ApiErrorOrigin;
		route: string;
		statusCode: number;
	}): void {
		const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(params.errorCode) ? params.errorCode : "UNCLASSIFIED_ERROR";
		this._apiErrorCount.add(1, {
			error_code: errorCode,
			error_origin: params.origin,
			http_route: params.route,
			request_method: getTelemetryHttpRequestMethod({ requestMethod: params.method }),
			status_class: `${Math.floor(params.statusCode / 100)}XX`,
			status_code: String(params.statusCode),
			traffic_surface: _getHttpTrafficSurface({ route: params.route }),
		});

		const activeSpan = trace.getActiveSpan();
		activeSpan?.setAttribute("error.code", errorCode);
		if (params.origin === ApiErrorOrigin.SERVER) {
			if (params.exception !== undefined) {
				const errorFields = getSafeErrorTelemetryFields({ error: params.exception });
				activeSpan?.addEvent("exception", {
					"exception.type": errorFields.errorName,
					...(errorFields.errorStackFrames === undefined
						? {}
						: { "cataqui.error.stack_frames": errorFields.errorStackFrames }),
				});
			}
			activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
		}
	}

	recordProductAnalyticsEvent(params: { eventName: ProductAnalyticsEventName }): void {
		this._productEventCount.add(1, { product_event: params.eventName });
	}

	async observeOperation<Result>(params: {
		operation: () => Promise<Result>;
		operationName: ObservabilityOperationName;
	}): Promise<Result> {
		return this._tracer.startActiveSpan(
			`cataqui.operation.${params.operationName.toLowerCase()}`,
			{ attributes: { operation_name: params.operationName } },
			async (span) => {
				const startedAt = performance.now();
				try {
					const result = await params.operation();
					span.setStatus({ code: SpanStatusCode.OK });
					this._operationCount.add(1, { operation_name: params.operationName, outcome: "SUCCESS" });
					this._operationDuration.record((performance.now() - startedAt) / 1_000, {
						operation_name: params.operationName,
						outcome: "SUCCESS",
					});
					return result;
				} catch (error: unknown) {
					const errorFields = getSafeErrorTelemetryFields({ error: error });
					span.addEvent("exception", {
						"exception.type": errorFields.errorName,
						...(errorFields.errorStackFrames === undefined
							? {}
							: { "cataqui.error.stack_frames": errorFields.errorStackFrames }),
					});
					span.setStatus({ code: SpanStatusCode.ERROR });
					this._operationCount.add(1, { operation_name: params.operationName, outcome: "ERROR" });
					this._operationDuration.record((performance.now() - startedAt) / 1_000, {
						operation_name: params.operationName,
						outcome: "ERROR",
					});
					throw error;
				} finally {
					span.end();
				}
			},
		);
	}
}
