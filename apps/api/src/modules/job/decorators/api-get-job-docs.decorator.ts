import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { publicJobExample } from "../job.examples";
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
			example: {
				data: publicJobExample,
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/jobs/00000000-0000-4000-8000-000000000002",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: {
				...apiInternalErrorExample,
				endpoint: "/v1/jobs/00000000-0000-4000-8000-000000000002",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No public job exists with the supplied jobId.",
		}),
	);
}
