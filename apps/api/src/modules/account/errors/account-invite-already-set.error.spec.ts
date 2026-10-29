import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { AccountInviteAlreadySetError } from "./account-invite-already-set.error";

it("identifies immutable account attribution as a conflict", () => {
	const error = new AccountInviteAlreadySetError();
	expect({ status: error.getStatus(), code: error.errorCode, message: error.message }).toEqual({
		status: HttpStatus.CONFLICT,
		code: ErrorCode.ACCOUNT_INVITE_ALREADY_SET,
		message: "The account's invite code has already been set and cannot be changed.",
	});
});
