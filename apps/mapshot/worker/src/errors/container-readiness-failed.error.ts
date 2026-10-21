import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class ContainerReadinessFailedError extends MapshotWorkerError {
	constructor(params: { message: string }) {
		super({ errorCode: MapshotWorkerErrorCode.CONTAINER_READINESS_FAILED, message: params.message });
	}
}
