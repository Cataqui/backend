import { AppError, AppErrorCode } from "../../errors/index";

export class RendererReadinessImageDimensionsError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_READINESS_IMAGE_DIMENSIONS,
			message: "Renderer readiness image must be 16 by 16 pixels.",
		});
	}
}
