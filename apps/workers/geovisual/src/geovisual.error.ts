import { GeovisualErrorCode } from "./geovisual-error-code.enum";

export class GeovisualError extends Error {
	constructor(readonly errorCode: Exclude<GeovisualErrorCode, GeovisualErrorCode.VALIDATION_ERROR>) {
		super(errorCode);
	}
}
