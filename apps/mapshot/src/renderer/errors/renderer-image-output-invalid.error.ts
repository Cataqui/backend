import { AppError, AppErrorCode } from "../../errors/index";

export class RendererImageOutputInvalidError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_IMAGE_OUTPUT_INVALID,
			message: "Renderer image response does not match the render output contract.",
		});
	}
}
