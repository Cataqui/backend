import { AppError, AppErrorCode } from "../../errors/index";

export class RendererProcessClosedError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.RENDERER_PROCESS_CLOSED, message: "Renderer process transport failed: CLOSED." });
	}
}
