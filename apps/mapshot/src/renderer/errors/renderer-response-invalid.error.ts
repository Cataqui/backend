import { AppError, AppErrorCode } from "../../errors/index";

export class RendererResponseInvalidError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_RESPONSE_INVALID,
			message: "Renderer response is not valid protocol JSON.",
		});
	}
}
