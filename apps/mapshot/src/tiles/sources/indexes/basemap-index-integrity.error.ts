import { AppError, AppErrorCode } from "../../../errors/index";

export class BasemapIndexIntegrityError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY, message: "Prepared basemap index failed: INTEGRITY." });
	}
}
