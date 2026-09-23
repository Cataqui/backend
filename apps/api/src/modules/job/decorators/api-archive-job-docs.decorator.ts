import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputSchema } from "../../../core/errors/error-output";
import { createSuccessResponseSchema } from "../../../shared/schemas/success-response.schema";
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
		ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid job ID.", standardSchema: ErrorOutputSchema }),
		ApiResponse({
			status: HttpStatus.UNAUTHORIZED,
			description: "A valid bearer access token is required.",
			standardSchema: ErrorOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The job does not exist or does not belong to this poster.",
			standardSchema: ErrorOutputSchema,
		}),
	);
}
