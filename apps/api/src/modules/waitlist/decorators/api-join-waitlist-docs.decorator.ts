import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";

export function ApiJoinWaitlistDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOperation({
			summary: "Join the waitlist",
			description: "Requests access for the authenticated account. ",
		}),
		ApiResponse({
			status: HttpStatus.NO_CONTENT,
			description: "The account joined the waitlist, was already waitlisted, or is already admitted. No response body.",
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
