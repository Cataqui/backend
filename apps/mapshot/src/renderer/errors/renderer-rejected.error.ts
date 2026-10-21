import { AppError, AppErrorCode } from "../../errors/index";

export class RendererRejectedError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.RENDERER_REJECTED, message: "Renderer rejected the requested operation." });
	}
}
