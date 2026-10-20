import { AppError, AppErrorCode } from "../../../errors/index";

export class PmtilesCompressionUnsupportedError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.PMTILES_COMPRESSION_UNSUPPORTED,
			message: "PMTiles resource compression is unsupported.",
		});
	}
}
