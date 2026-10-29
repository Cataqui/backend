import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";

export function ApiCompleteOnboardingDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOperation({
			summary: "Complete onboarding",
			description:
				"Marks onboarding complete for the authenticated account. No request body or profile is required. Repeating the operation is safe. Admission is unchanged.",
		}),
		ApiResponse({ status: HttpStatus.NO_CONTENT, description: "Onboarding is complete. No response body." }),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
