import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class AccessTokenRequiredError extends AppError {
	constructor() {
		super({ status: 401, errorCode: MapsErrorCode.UNAUTHORIZED, message: "A valid bearer token is required." });
	}
}
