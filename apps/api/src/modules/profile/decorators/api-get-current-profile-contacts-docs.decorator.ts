import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { SavedContactsOutputSchema } from "../../contact/schemas/saved-contacts-output.schema";

export function ApiGetCurrentProfileContactsDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: SavedContactsOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get saved contacts",
			description: "Returns the authenticated profile's contacts available for job posts",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Saved contacts returned for the authenticated profile.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
