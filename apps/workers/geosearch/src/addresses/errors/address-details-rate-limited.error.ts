import { GeosearchErrorCode } from "../../shared/geosearch-error-code.enum";
import { GeosearchError } from "../../shared/geosearch.error";

export class AddressDetailsRateLimitedError extends GeosearchError {
	constructor() {
		super({
			errorCode: GeosearchErrorCode.RATE_LIMITED,
			message: "Too many address detail requests. Try again shortly.",
			status: 429,
			headers: { "Retry-After": "60" },
		});
	}
}
