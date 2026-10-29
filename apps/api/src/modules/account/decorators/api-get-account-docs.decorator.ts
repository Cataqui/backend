import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { AccountOutputSchema } from "../schemas/account-output.schema";

export function ApiGetAccountDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: AccountOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get current account",
			description: "Returns the authenticated account, creating it if needed.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Current account returned.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
