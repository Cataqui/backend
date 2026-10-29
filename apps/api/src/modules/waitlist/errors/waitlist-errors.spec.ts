import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { WaitlistRequiredError } from "./waitlist-required.error";

it.each([{ ErrorType: WaitlistRequiredError, status: HttpStatus.FORBIDDEN, code: ErrorCode.WAITLIST_REQUIRED }])(
	"presents $code with an actionable operation-specific error",
	({ ErrorType, status, code }) => {
		const error = new ErrorType();
		expect({ status: error.getStatus(), code: error.errorCode }).toEqual({ status: status, code: code });
	},
);
