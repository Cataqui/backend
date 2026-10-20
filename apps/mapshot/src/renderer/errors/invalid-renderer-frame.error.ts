import { AppError, AppErrorCode } from "../../errors/index";

export class InvalidRendererFrameError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.INVALID_RENDERER_FRAME,
			message: "Renderer process transport failed: INVALID_FRAME.",
		});
	}
}
