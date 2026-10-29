import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";

export function ApiSkipWaitlistDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOperation({
			summary: "Skip the waitlist",
			description:
				"Admits a waitlisted account using an invite code and records its referral. Already admitted accounts succeed without changing attribution or consuming invite capacity, regardless of the supplied code.",
		}),
		ApiResponse({
			status: HttpStatus.NO_CONTENT,
			description: "The account was admitted or already had access. No response body.",
		}),
		ApiResponse({
			status: HttpStatus.FORBIDDEN,
			description:
				"Join the waitlist before using an invite code if access has not been requested (WAITLIST_REQUIRED).",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description:
				"The account already has invite attribution (ACCOUNT_INVITE_ALREADY_SET). Its referral cannot be changed.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNPROCESSABLE_ENTITY,
			description:
				"For waitlisted accounts, the code is unknown, disabled, or exhausted (INVITE_UNAVAILABLE). Try another code; admission and attribution were not changed.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
