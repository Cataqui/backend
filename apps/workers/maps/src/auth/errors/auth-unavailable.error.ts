import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AuthUnavailableError extends AppError {
	constructor() {
		super({
			status: 503,
			errorCode: MapsErrorCode.AUTH_UNAVAILABLE,
			message: "Authentication is temporarily unavailable.",
		});
	}
}
