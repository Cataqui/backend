import { HttpStatus } from "@nestjs/common";
import { DomainError } from "./domain-error";
import { ErrorCode } from "./error-code.enum";

export class RouteNotFoundException extends DomainError {
	constructor() {
		super(ErrorCode.ROUTE_NOT_FOUND, "The requested endpoint was not found. Perhaps you meant to use a different HTTP method?", HttpStatus.NOT_FOUND);
	}
}
