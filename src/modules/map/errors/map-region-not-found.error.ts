import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../core/errors/domain-error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

export class MapRegionNotFoundError extends DomainError {
	constructor() {
		super(ErrorCode.MAP_REGION_NOT_FOUND, "No map available for the requested region.", HttpStatus.NOT_FOUND);
	}
}
