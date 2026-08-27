export enum TelemetryHttpRequestMethod {
	CONNECT = "CONNECT",
	DELETE = "DELETE",
	GET = "GET",
	HEAD = "HEAD",
	OPTIONS = "OPTIONS",
	OTHER = "_OTHER",
	PATCH = "PATCH",
	POST = "POST",
	PUT = "PUT",
	QUERY = "QUERY",
	TRACE = "TRACE",
}

export function getTelemetryHttpRequestMethod(params: { requestMethod: string }): TelemetryHttpRequestMethod {
	switch (params.requestMethod.toUpperCase()) {
		case TelemetryHttpRequestMethod.CONNECT:
			return TelemetryHttpRequestMethod.CONNECT;
		case TelemetryHttpRequestMethod.DELETE:
			return TelemetryHttpRequestMethod.DELETE;
		case TelemetryHttpRequestMethod.GET:
			return TelemetryHttpRequestMethod.GET;
		case TelemetryHttpRequestMethod.HEAD:
			return TelemetryHttpRequestMethod.HEAD;
		case TelemetryHttpRequestMethod.OPTIONS:
			return TelemetryHttpRequestMethod.OPTIONS;
		case TelemetryHttpRequestMethod.PATCH:
			return TelemetryHttpRequestMethod.PATCH;
		case TelemetryHttpRequestMethod.POST:
			return TelemetryHttpRequestMethod.POST;
		case TelemetryHttpRequestMethod.PUT:
			return TelemetryHttpRequestMethod.PUT;
		case TelemetryHttpRequestMethod.QUERY:
			return TelemetryHttpRequestMethod.QUERY;
		case TelemetryHttpRequestMethod.TRACE:
			return TelemetryHttpRequestMethod.TRACE;
	}

	return TelemetryHttpRequestMethod.OTHER;
}
