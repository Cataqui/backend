import { AppError, AppErrorCode } from "../../../errors/index";

export class PmtilesDirectoryInvalidError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.PMTILES_DIRECTORY_INVALID,
			message: "PMTiles directory encoding or entries are invalid.",
		});
	}
}
