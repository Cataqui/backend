import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class R2ObjectNotFoundError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.R2_OBJECT_NOT_FOUND,
			message: "The requested R2 object was not found.",
		});
	}
}
