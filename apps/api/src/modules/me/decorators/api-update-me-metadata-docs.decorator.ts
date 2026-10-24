import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { AccountMetadataOutputSchema } from "../schemas/account-metadata-output.schema";

export function ApiUpdateMeMetadataDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: AccountMetadataOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Update current user metadata",
			description:
				"Updates the authenticated user's private metadata and returns the complete result. Omitted fields remain unchanged; an empty object leaves metadata unchanged. onboardingCompleted accepts true or false as reported by the client, without profile or onboarding prerequisite checks. Repeating the same update is safe. Unknown fields and non-boolean onboardingCompleted values are rejected with field-level validation violations.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Current user metadata returned after applying the update.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
