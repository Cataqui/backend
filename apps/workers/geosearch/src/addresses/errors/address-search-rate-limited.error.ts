import { GeosearchErrorCode } from "../../shared/geosearch-error-code.enum";
import { GeosearchError } from "../../shared/geosearch.error";

export class AddressSearchRateLimitedError extends GeosearchError {
	constructor() {
		super({
			errorCode: GeosearchErrorCode.RATE_LIMITED,
			message: "Too many address searches. Try again shortly.",
			status: 429,
			headers: { "Retry-After": "60" },
		});
	}
}
