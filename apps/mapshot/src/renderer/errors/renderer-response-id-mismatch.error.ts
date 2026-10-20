import { AppError, AppErrorCode } from "../../errors/index";

export class RendererResponseIdMismatchError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_RESPONSE_ID_MISMATCH,
			message: "Renderer response identifier does not match the pending request.",
		});
	}
}
