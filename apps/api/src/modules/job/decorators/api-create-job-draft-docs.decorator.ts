import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { DraftJobOutputSchema } from "../schemas/draft-job-output.schema";

export function ApiCreateJobDraftDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: DraftJobOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Create a job draft",
			description:
				"Creates a draft from a job description and schedules AI-derived feed metadata. Use the returned jobId to update and publish the job later. Each authenticated user may create up to 20 drafts per hour.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Job draft created.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid job description.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "The authenticated user has created 20 job drafts during the current one-hour window.",
			headers: {
				"Retry-After": {
					description: "Seconds until another draft-creation request may be attempted.",
					schema: { type: "integer", example: 900 },
				},
			},
			standardSchema: ErrorOutputSchema,
		}),
	);
}
