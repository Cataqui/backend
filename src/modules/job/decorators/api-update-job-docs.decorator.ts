import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiUpdateJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Update a public job",
			description:
				"Updates an active or closed public job and leaves omitted fields unchanged. A description change refreshes its derived metadata before saving, so the public response always matches the current description. Each authenticated user may submit up to 60 public-job updates per hour.",
		}),
		ApiParam({
			name: "jobId",
			description: "ID of the public job to update.",
			type: String,
			format: "uuid",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The public job was updated and returned with complete public fields.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description:
				"The request is invalid in some way, e.g. an invalid field, incomplete nested object, etc. No changes were saved.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No public job owned by the authenticated user exists with the supplied jobId.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "The authenticated user has submitted 60 job updates during the current one-hour window.",
			headers: {
				"Retry-After": {
					description: "Seconds until another job-update request may be attempted.",
					schema: { type: "integer", example: 300 },
				},
			},
			standardSchema: ErrorOutputSchema,
		}),
	);
}
