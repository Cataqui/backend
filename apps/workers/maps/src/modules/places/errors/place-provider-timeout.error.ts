import { MapsErrorCode } from "../../../shared/maps-error-code.enum";
import { MapsError } from "../../../shared/maps.error";

export class PlaceProviderTimeoutError extends MapsError {
	constructor() {
		super({
			errorCode: MapsErrorCode.PROVIDER_TIMEOUT,
			message: "Place search is temporarily unavailable.",
		});
	}
}
