import { AiErrorCode } from "../../errors/ai-error-code.enum";
import { AppError } from "../../errors/app.error";

export class RouteNotFoundError extends AppError {
	constructor() {
		super({ status: 404, errorCode: AiErrorCode.ROUTE_NOT_FOUND, message: "The requested route was not found." });
	}
}
