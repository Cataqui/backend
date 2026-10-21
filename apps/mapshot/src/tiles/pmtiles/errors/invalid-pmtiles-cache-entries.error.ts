import { AppError, AppErrorCode } from "../../../errors/index";

export class InvalidPmtilesCacheEntriesError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.INVALID_PMTILES_CACHE_ENTRIES,
			message: "Invalid PMTiles directory cache budget: maximumEntries must be a positive safe integer.",
		});
	}
}
