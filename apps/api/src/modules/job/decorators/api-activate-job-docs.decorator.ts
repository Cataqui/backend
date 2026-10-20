import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiActivateJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({
			summary: "Activate an archived job",
			description: "The poster can return an archived job to the feed. Repeating this request returns the active job.",
		}),
		ApiResponse({ status: HttpStatus.OK, description: "Job active.", standardSchema: responseSchema }),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The job does not exist or does not belong to this poster.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
