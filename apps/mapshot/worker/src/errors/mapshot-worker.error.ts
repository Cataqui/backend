import type { MapshotWorkerErrorCode } from "./mapshot-worker-error-code.enum";

export abstract class MapshotWorkerError extends Error {
	readonly errorCode: MapshotWorkerErrorCode;

	constructor(params: { errorCode: MapshotWorkerErrorCode; message?: string }) {
		super(params.message);
		this.name = new.target.name;
		this.errorCode = params.errorCode;
	}
}
