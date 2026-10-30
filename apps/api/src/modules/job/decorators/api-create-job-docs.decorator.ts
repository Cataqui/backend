import { ContactMethod } from "../../../../generated/prisma/client";
import { CreateJobInputSchema } from "../schemas/create-job-input.schema";
import type { z } from "zod";
import { apiInternalErrorExample, apiValidationErrorExample } from "../../../core/errors/api-error.examples";
import { publicJobExample } from "../job.examples";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBody, ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";

export function ApiCreateJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });
	return applyDecorators(
		// Swagger merges these examples with the Standard Schema supplied by @Body.
		ApiBody({
			schema: {},
			examples: {
				eventSetup: {
					summary: "Example submission",
					value: {
						description: "Preciso de ajuda para montar mesas no sábado, das 9h às 13h. Pagamento de R$ 120 no dia.",
						location: { title: "Centro de Osasco", latitude: -23.5325, longitude: -46.7917 },
						contact: { method: ContactMethod.WHATSAPP, identifier: "+12025550123" },
					} satisfies z.input<typeof CreateJobInputSchema>,
				},
			},
		}),
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
			example: {
				data: publicJobExample,
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/jobs",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid post or idempotency key.",
			example: {
				...apiValidationErrorExample,
				endpoint: "/v1/jobs",
				violations: [{ path: ["description"], message: "Too small: expected string to have >=10 characters" }],
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/jobs" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
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
