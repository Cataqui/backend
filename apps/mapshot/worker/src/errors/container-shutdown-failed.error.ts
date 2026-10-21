import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class ContainerShutdownFailedError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.CONTAINER_SHUTDOWN_FAILED,
			message: "Mapshot container shutdown failed.",
		});
	}
}
