import { AppError, AppErrorCode } from "../../errors/index";

export class RendererTextCoverageInvalidError extends AppError {
	constructor() {
		super({
			errorCode: AppErrorCode.RENDERER_TEXT_COVERAGE_INVALID,
			message: "Renderer image text coverage is invalid.",
		});
	}
}
