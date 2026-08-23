import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { DraftJobOutputSchema } from "../schemas/draft-job-output.schema";

export function ApiUpdateJobDraftDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: DraftJobOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Update a job draft",
			description: "Updates the supplied draft fields and leaves omitted fields unchanged.",
		}),
		ApiParam({
			name: "jobId",
			description: "ID of the draft to update.",
			type: String,
			format: "uuid",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The draft was updated; derived metadata may still be refreshing.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description:
				"The request is invalid in some way, e.g. an invalid field or incomplete nested object. No changes were saved.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No draft owned by the authenticated user exists with the supplied jobId.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "The authenticated user has submitted more draft updates than the allowed limit",
			headers: {
				"Retry-After": {
					description: "Seconds until another draft-update request may be attempted.",
					schema: { type: "integer", example: 300 },
				},
			},
			standardSchema: ErrorOutputSchema,
		}),
	);
}
