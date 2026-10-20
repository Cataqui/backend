import { AppError, AppErrorCode } from "../../errors/index";

export class RendererRenderFailedError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.RENDERER_RENDER_FAILED, message: "Renderer process render operation failed." });
	}
}
