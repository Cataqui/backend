import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { ProfileCreationConflictError } from "./profile-creation-conflict.error";
import { ProfileNotFoundError } from "./profile-not-found.error";
import { ProfileRequiredError } from "./profile-required.error";

it.each([
	{ ErrorType: ProfileCreationConflictError, code: ErrorCode.PROFILE_CREATION_CONFLICT, status: HttpStatus.CONFLICT },
	{ ErrorType: ProfileNotFoundError, code: ErrorCode.PROFILE_NOT_FOUND, status: HttpStatus.NOT_FOUND },
	{ ErrorType: ProfileRequiredError, code: ErrorCode.PROFILE_REQUIRED, status: HttpStatus.CONFLICT },
])("presents $code with its operation-specific status", ({ ErrorType, code, status }) => {
	const error = new ErrorType();
	expect({ code: error.errorCode, status: error.getStatus() }).toEqual({ code: code, status: status });
});
