import { AppError, AppErrorCode } from "../../../errors/index";

export class PmtilesOperationSignalMissingError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.PMTILES_OPERATION_SIGNAL_MISSING,
			message: "PMTiles source must supply an operation cancellation signal.",
		});
	}
}
