import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { InviteUnavailableError } from "./invite-unavailable.error";

it("presents an actionable invite availability error independently of waitlist admission", () => {
	const error = new InviteUnavailableError();
	expect({ status: error.getStatus(), code: error.errorCode, message: error.message }).toEqual({
		status: HttpStatus.UNPROCESSABLE_ENTITY,
		code: ErrorCode.INVITE_UNAVAILABLE,
		message: "The supplied inviteCode is unknown, disabled, or has reached its usage limit. Use another invite code.",
	});
});
