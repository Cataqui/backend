import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class TransformationUnavailableError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE,
			message: "The static map could not be prepared.",
		});
	}
}
