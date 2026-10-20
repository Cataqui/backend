import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiArchiveJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({
			summary: "Archive a posted job",
			description: "The poster can remove a job from the feed. Repeating this request returns the archived job.",
		}),
		ApiResponse({ status: HttpStatus.OK, description: "Job archived.", standardSchema: responseSchema }),
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
