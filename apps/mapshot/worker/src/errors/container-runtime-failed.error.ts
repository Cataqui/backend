import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class ContainerRuntimeFailedError extends MapshotWorkerError {
	constructor() {
		super({ errorCode: MapshotWorkerErrorCode.CONTAINER_RUNTIME_FAILED, message: "Mapshot container runtime failed." });
	}
}
