import { AppError, AppErrorCode } from "../../errors/index";

export class RendererInitializationFailedError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_INITIALIZATION_FAILED,
			message: "Renderer process initialization operation failed.",
		});
	}
}
