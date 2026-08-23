import { GeosearchErrorCode } from "../../shared/geosearch-error-code.enum";
import { GeosearchError } from "../../shared/geosearch.error";

export class AddressProviderTimeoutError extends GeosearchError {
	constructor() {
		super({
			errorCode: GeosearchErrorCode.PROVIDER_UNAVAILABLE,
			message: "Address search is temporarily unavailable.",
			status: 504,
		});
	}
}
