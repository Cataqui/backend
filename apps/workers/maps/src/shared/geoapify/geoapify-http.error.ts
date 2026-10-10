import { MapsError } from "../maps.error";
import { MapsErrorCode } from "../maps-error-code.enum";

export function createGeoapifyHttpError(params: { response: Response }): MapsError {
	const status = params.response.status;
	let retryAfterMs: number | undefined;
	if (status === 429 || status === 503) {
		const value = params.response.headers.get("Retry-After")?.trim();
		if (value) {
			if (/^\d+$/.test(value)) {
				const milliseconds = Number(value) * 1_000;
				// Keep huge valid delays above the budget rather than falling back to an early retry.
				retryAfterMs = Number.isFinite(milliseconds) ? milliseconds : Number.MAX_VALUE;
			} else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(value)) {
				const date = Date.parse(value);
				if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - Date.now());
			}
		}
	}
	return new MapsError({
		errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
		retryable: status === 429 || status >= 500,
		retryAfterMs: retryAfterMs,
	});
}
