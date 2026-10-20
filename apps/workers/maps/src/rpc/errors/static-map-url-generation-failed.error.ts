import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class StaticMapUrlGenerationFailedError extends AppError {
	constructor() {
		super({ status: 500, errorCode: MapsErrorCode.INTERNAL_ERROR, message: "Static map URL generation failed." });
	}
}
