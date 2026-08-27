import type { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";

const _HTTP_REQUEST_TERMINATIONS = new WeakMap<object, HttpRequestTerminationReason>();

export function rememberHttpRequestTermination(params: {
	request: object;
	terminationReason: HttpRequestTerminationReason;
}): void {
	if (_HTTP_REQUEST_TERMINATIONS.has(params.request)) return;
	_HTTP_REQUEST_TERMINATIONS.set(params.request, params.terminationReason);
}

export function findHttpRequestTerminationReason(params: {
	request: object;
}): HttpRequestTerminationReason | undefined {
	return _HTTP_REQUEST_TERMINATIONS.get(params.request);
}
