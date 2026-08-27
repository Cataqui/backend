interface IHttpRouteTelemetry {
	method: string;
	route: string;
}

const _httpRouteTelemetryByRequest = new WeakMap<object, IHttpRouteTelemetry>();

export function rememberHttpRouteTelemetry(params: { method: string; rawRequest: object; route: string }): void {
	_httpRouteTelemetryByRequest.set(params.rawRequest, { method: params.method, route: params.route });
}

export function getHttpRouteTelemetry(params: { rawRequest: object }): IHttpRouteTelemetry | undefined {
	return _httpRouteTelemetryByRequest.get(params.rawRequest);
}
