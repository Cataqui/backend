import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class ImageNotFoundError extends AppError {
	constructor() {
		super({
			status: 404,
			errorCode: MapsErrorCode.IMAGE_NOT_FOUND,
			message: "The static image was not found.",
		});
	}
}
