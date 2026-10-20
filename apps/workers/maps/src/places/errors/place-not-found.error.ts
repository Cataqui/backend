import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PlaceNotFoundError extends AppError {
	constructor() {
		super({ status: 404, errorCode: MapsErrorCode.PLACE_NOT_FOUND, message: "The requested place was not found." });
	}
}
