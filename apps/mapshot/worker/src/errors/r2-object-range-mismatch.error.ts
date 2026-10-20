import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class R2ObjectRangeMismatchError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.R2_OBJECT_RANGE_MISMATCH,
			message: "The R2 response range length is missing or does not match the requested byte count.",
		});
	}
}
