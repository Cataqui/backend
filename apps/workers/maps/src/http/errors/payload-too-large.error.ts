import { MapsErrorCode } from "../../errors/maps-error-code.enum";
import { AppError } from "../../errors/app.error";

export class PayloadTooLargeError extends AppError {
	constructor() {
		super({ status: 413, errorCode: MapsErrorCode.PAYLOAD_TOO_LARGE, message: "The request body is too large." });
	}
}
