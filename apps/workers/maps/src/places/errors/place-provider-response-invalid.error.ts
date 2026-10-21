import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PlaceProviderResponseInvalidError extends AppError {
	constructor() {
		super({
			status: 502,
			errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			message: "The place provider returned an invalid response.",
		});
	}
}
