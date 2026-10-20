import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PlaceProviderUnavailableError extends AppError {
	constructor() {
		super({
			status: 502,
			errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			message: "The place provider is temporarily unavailable.",
		});
	}
}
