import { AppError, AppErrorCode } from "../../errors/index";

export class RendererImageDimensionsMismatchError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_IMAGE_DIMENSIONS_MISMATCH,
			message: "Renderer image dimensions do not match the requested representation.",
		});
	}
}
