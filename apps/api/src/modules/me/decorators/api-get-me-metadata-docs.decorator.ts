import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { AccountMetadataOutputSchema } from "../schemas/account-metadata-output.schema";

export function ApiGetMeMetadataDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: AccountMetadataOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get current user metadata",
			description: "Returns the authenticated user's private metadata. A profile is not require",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Current user metadata returned.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
