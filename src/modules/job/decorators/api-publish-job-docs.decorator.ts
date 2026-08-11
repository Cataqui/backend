import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiPublishJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Publish a job",
			description:
				"Publishes a completed draft and makes it available in the job feed. Before publishing, use `PATCH /v1/jobs/drafts/{jobId}` to add any fields that are missing or you want to change. \n\n" +
				"If the draft is incomplete, it remains a draft. Repeating the request for an active job returns that job without publishing it again. A closed job cannot be published again. Each authenticated user may submit up to 20 publication requests per hour.",
		}),
		ApiParam({
			name: "jobId",
			description: "ID of the draft to publish.",
			type: String,
			format: "uuid",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The job was published and returned, or the already active job was returned unchanged.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description:
				"The draft is missing one or more required fields. The error message lists the fields to add before trying again.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job owned by the authenticated user exists with the supplied jobId.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description: "The job is closed and cannot be published again.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "The authenticated user has submitted 20 publication requests during the current one-hour window.",
			headers: {
				"Retry-After": {
					description: "Seconds until another publication request may be attempted.",
					schema: { type: "integer", example: 900 },
				},
			},
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description:
				"Important data could not be derived from the description. The job remains a draft; try publishing it again.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
