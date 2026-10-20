import { AppError, AppErrorCode } from "../../../errors/index";

export class InvalidPmtilesDecodedEntriesError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.INVALID_PMTILES_DECODED_ENTRIES,
			message: "Invalid PMTiles directory cache budget: decoded entries must be a positive safe integer.",
		});
	}
}
