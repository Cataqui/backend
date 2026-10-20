import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createPaginatedSuccessResponseSchema } from "@cataqui/response";
import { ProfileJobSummaryOutputSchema } from "../../job/schemas/profile-job-summary-output.schema";

export function ApiGetProfileJobsDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createPaginatedSuccessResponseSchema({ itemSchema: ProfileJobSummaryOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get the authenticated profile's posted jobs",
			description: "Returns active and archived jobs in newest-first order.",
		}),
		ApiResponse({ status: HttpStatus.OK, description: "Posted jobs returned.", standardSchema: responseSchema }),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
