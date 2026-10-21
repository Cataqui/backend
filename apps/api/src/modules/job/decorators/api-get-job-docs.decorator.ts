import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiGetJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get a public job by ID" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Public job found.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No public job exists with the supplied jobId.",
		}),
	);
}
