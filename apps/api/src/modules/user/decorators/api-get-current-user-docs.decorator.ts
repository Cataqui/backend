import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { CurrentUserOutputSchema } from "../schemas/current-user-output.schema";

export function ApiGetCurrentUserDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: CurrentUserOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({ summary: "Get current user", description: "Returns information about the authenticated user." }),
		ApiResponse({ status: HttpStatus.OK, description: "Current user returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
