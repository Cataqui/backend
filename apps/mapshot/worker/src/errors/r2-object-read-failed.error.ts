import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class R2ObjectReadFailedError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.R2_OBJECT_READ_FAILED,
			message: "The R2 provider failed to read the requested object byte range.",
		});
	}
}
