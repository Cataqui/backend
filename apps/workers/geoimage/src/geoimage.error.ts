import { GeoimageErrorCode } from "./geoimage-error-code.enum";

export class GeoimageError extends Error {
	constructor(readonly errorCode: Exclude<GeoimageErrorCode, GeoimageErrorCode.VALIDATION_ERROR>) {
		super(errorCode);
	}
}
