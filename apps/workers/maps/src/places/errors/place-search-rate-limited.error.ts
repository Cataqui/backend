import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PlaceSearchRateLimitedError extends AppError {
	readonly retryAfterMs = 60_000;

	constructor() {
		super({
			status: 429,
			errorCode: MapsErrorCode.RATE_LIMITED,
			message: "Too many place searches. Try again shortly.",
		});
	}
}
