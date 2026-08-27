export const ObservabilityConstants = {
	DATADOG_MANAGED_OTLP_ENDPOINT: "https://cloudflare.integrations.otlp.datadoghq.com",
	API_ERROR_COUNT_METRIC_NAME: "cataqui.api.error.count",
	HTTP_ACTIVE_REQUESTS_METRIC_NAME: "cataqui.api.http.server.active_requests",
	HTTP_REQUEST_COUNT_METRIC_NAME: "cataqui.api.http.server.request.count",
	HTTP_REQUEST_DURATION_METRIC_NAME: "cataqui.api.http.server.request.duration",
	OTLP_DISABLED_HEADERS_VALUE: "disabled",
	OPERATION_COUNT_METRIC_NAME: "cataqui.api.operation.count",
	OPERATION_DURATION_METRIC_NAME: "cataqui.api.operation.duration",
	PRODUCT_EVENT_COUNT_METRIC_NAME: "cataqui.api.product.event.count",
	SERVICE_NAME: "cataqui-api",
} as const;
