import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiCreateJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiHeader({
			name: "Idempotency-Key",
			required: true,
			description:
				"A UUID unique to this submission. Reuse it for unchanged retries; use a new key after editing the form.",
		}),
		ApiOperation({
			summary: "Post a job",
			description:
				"Creates an active job from a complete post. Retrying with the same key and content returns the same job.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Job posted or previously created by this request.",
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid post or idempotency key.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description: "A profile is required, or this idempotency key was used for different post content.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.TOO_MANY_REQUESTS,
			description: "Posting rate limit reached.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description:
				"Job details or maps could not be prepared. Keep the form and retry unchanged content with the same Idempotency-Key.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
