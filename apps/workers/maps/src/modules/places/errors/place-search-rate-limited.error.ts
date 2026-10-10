import { MapsErrorCode } from "../../../shared/maps-error-code.enum";
import { MapsError } from "../../../shared/maps.error";

export class PlaceSearchRateLimitedError extends MapsError {
	constructor() {
		super({
			errorCode: MapsErrorCode.RATE_LIMITED,
			message: "Too many place searches. Try again shortly.",
			retryAfterMs: 60_000,
		});
	}
}
