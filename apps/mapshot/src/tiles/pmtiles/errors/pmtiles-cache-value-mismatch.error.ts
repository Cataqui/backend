import { AppError, AppErrorCode } from "../../../errors/index";

export class PmtilesCacheValueMismatchError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.PMTILES_CACHE_VALUE_MISMATCH,
			message: "PMTiles cache returned a value of the wrong metadata kind.",
		});
	}
}
