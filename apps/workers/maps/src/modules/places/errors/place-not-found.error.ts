import { MapsErrorCode } from "../../../shared/maps-error-code.enum";
import { MapsError } from "../../../shared/maps.error";

export class PlaceNotFoundError extends MapsError {
	constructor() {
		super({
			errorCode: MapsErrorCode.PLACE_NOT_FOUND,
			message: "The requested place was not found.",
		});
	}
}
