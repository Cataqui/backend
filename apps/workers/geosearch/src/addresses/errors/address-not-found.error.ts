import { GeosearchErrorCode } from "../../shared/geosearch-error-code.enum";
import { GeosearchError } from "../../shared/geosearch.error";

export class AddressNotFoundError extends GeosearchError {
	constructor() {
		super({
			errorCode: GeosearchErrorCode.ADDRESS_NOT_FOUND,
			message: "The requested address was not found.",
			status: 404,
		});
	}
}
