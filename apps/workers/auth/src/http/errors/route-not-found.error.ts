import { AppErrorCode } from "../../errors/app-error-code.enum";
import { AppError } from "../../errors/app.error";

export class RouteNotFoundError extends AppError {
	constructor() {
		super({ status: 404, errorCode: AppErrorCode.ROUTE_NOT_FOUND, message: "The requested endpoint was not found." });
	}
}
