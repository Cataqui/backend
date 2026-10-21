import { AppError, AppErrorCode } from "../../errors/index";

export class ContainerNotReadyError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.NOT_READY, message: "The Mapshot container is not ready to render." });
	}
}
