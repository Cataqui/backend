import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class R2ObjectReadAbortedError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.R2_OBJECT_READ_ABORTED,
			message: "The R2 object byte range read was aborted.",
		});
	}
}
