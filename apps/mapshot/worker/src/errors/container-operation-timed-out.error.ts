import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class ContainerOperationTimedOutError extends MapshotWorkerError {
	constructor() {
		super({
			errorCode: MapshotWorkerErrorCode.CONTAINER_OPERATION_TIMED_OUT,
			message: "Mapshot container operation timed out.",
		});
	}
}
