import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class ContainerUnavailableError extends MapshotWorkerError {
	constructor() {
		super({ errorCode: MapshotWorkerErrorCode.CONTAINER_UNAVAILABLE, message: "Mapshot container is unavailable." });
	}
}
