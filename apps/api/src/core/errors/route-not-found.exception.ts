import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-code.enum";

export class RouteNotFoundException extends AppError {
	constructor() {
		super(
			ErrorCode.ROUTE_NOT_FOUND,
			"The requested endpoint was not found. Perhaps you meant to use a different HTTP method?",
			HttpStatus.NOT_FOUND,
		);
	}
}
