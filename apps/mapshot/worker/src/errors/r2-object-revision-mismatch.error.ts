import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class R2ObjectRevisionMismatchError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.R2_OBJECT_REVISION_MISMATCH,
			message: "The R2 object's ETag does not match the requested revision.",
		});
	}
}
