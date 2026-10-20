import { AppError, AppErrorCode } from "../../errors/index";

export class UnrepresentableTileCoordinatesError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.UNREPRESENTABLE_TILE_COORDINATES,
			message: "The viewport's tile coordinates cannot be represented as exact integers.",
		});
	}
}
