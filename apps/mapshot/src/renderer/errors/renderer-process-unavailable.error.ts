import { AppError, AppErrorCode } from "../../errors/index";

export class RendererProcessUnavailableError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_PROCESS_UNAVAILABLE,
			message: "Renderer process transport failed: UNAVAILABLE.",
		});
	}
}
