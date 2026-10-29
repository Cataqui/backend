import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { ProfileOutputSchema } from "../schemas/profile-output.schema";

export function ApiCreateProfileDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Create your profile",
			description: "Creates the authenticated account's profile",
		}),
		ApiResponse({ status: HttpStatus.CREATED, description: "Profile created.", standardSchema: responseSchema }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The same profile creation was already completed.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description: "A profile already exists with different onboarding information (PROFILE_CREATION_CONFLICT).",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
