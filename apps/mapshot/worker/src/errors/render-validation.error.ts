import type { ValidationViolation } from "@cataqui/response";
import { MapshotWorkerError, MapshotWorkerErrorCode } from "./index";

export class RenderValidationError extends MapshotWorkerError {
	constructor(params: { violations: ValidationViolation[] }) {
		super({
			errorCode: MapshotWorkerErrorCode.VALIDATION_ERROR,
			message: JSON.stringify({ violations: params.violations }),
		});
	}
}
