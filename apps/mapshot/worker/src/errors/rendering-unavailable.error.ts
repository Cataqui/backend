import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class RenderingUnavailableError extends MapshotWorkerError {
	constructor() {
		super({ errorCode: MapshotWorkerErrorCode.RENDERING_UNAVAILABLE });
	}
}
