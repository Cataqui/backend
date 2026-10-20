import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ProfileOutputSchema } from "../schemas/profile-output.schema";

export function ApiGetCurrentProfileDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get current profile",
			description: "Returns information about the authenticated profile.",
		}),
		ApiResponse({ status: HttpStatus.OK, description: "Current profile returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The authenticated account has not created a profile (PROFILE_NOT_FOUND).",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
