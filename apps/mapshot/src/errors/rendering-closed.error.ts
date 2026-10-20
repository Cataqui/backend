import { AppError } from "./app.error";
import { AppErrorCode } from "./app-error-code.enum";

export class RenderingClosedError extends AppError {
	constructor() {
		super({ errorCode: AppErrorCode.CLOSED, message: "Mapshot rendering is closed" });
	}
}
