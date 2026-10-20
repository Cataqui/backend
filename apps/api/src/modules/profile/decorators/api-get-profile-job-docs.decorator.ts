import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ProfileJobOutputSchema } from "../../job/schemas/profile-job-output.schema";

export function ApiGetProfileJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({ summary: "Get one of the authenticated profile's posted jobs" }),
		ApiResponse({ status: HttpStatus.OK, description: "Posted job returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job owned by the authenticated profile exists with the supplied job ID.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
