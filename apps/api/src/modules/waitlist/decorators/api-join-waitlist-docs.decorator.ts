import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";

export function ApiJoinWaitlistDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOperation({
			summary: "Join the waitlist",
			description:
				"Requests access for the authenticated account. Accounts that are already admitted cannot join the waitlist.",
		}),
		ApiResponse({
			status: HttpStatus.NO_CONTENT,
			description: "The account joined the waitlist or was already waitlisted. No response body.",
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description:
				"The account is already admitted (ACCOUNT_ALREADY_ADMITTED). Access is already granted; do not retry joining the waitlist.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
