import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PlaceProviderTimeoutError extends AppError {
	constructor() {
		super({ status: 504, errorCode: MapsErrorCode.PROVIDER_TIMEOUT, message: "The place provider request timed out." });
	}
}
