import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { JobStatus } from "../../../../generated/prisma/client";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createPaginatedSuccessResponseSchema } from "@cataqui/response";
import { ProfileJobSummaryOutputSchema } from "../../job/schemas/profile-job-summary-output.schema";

export function ApiGetProfileJobsDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createPaginatedSuccessResponseSchema({ itemSchema: ProfileJobSummaryOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get the authenticated profile's posted jobs",
			description: "Returns active and archived jobs in newest-first order.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Posted jobs returned.",
			examples: {
				populated: {
					summary: "Jobs available",
					value: {
						data: [
							{
								jobId: "00000000-0000-4000-8000-000000000002",
								title: "Ajudante para evento no sábado",
								descriptionSummary: "Montagem de mesas das 9h às 13h. R$ 120 no dia.",
								payment: "R$ 120 no dia",
								location: {
									latitude: -23.532,
									longitude: -46.792,
									areaRadius: 300,
									imageUrl: "https://maps.example.com/static/v1/example.webp",
								},
								status: JobStatus.ACTIVE,
								createdAt: "2026-10-30T12:00:00.000Z",
								updatedAt: "2026-10-30T12:00:00.000Z",
							},
						],
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/profiles/me/jobs",
						pagination: { hasMore: false, nextCursor: null },
					} satisfies z.output<typeof responseSchema>,
				},
				empty: {
					summary: "No jobs available",
					value: {
						data: [],
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/profiles/me/jobs",
						pagination: { hasMore: false, nextCursor: null },
					} satisfies z.output<typeof responseSchema>,
				},
			},
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/profiles/me/jobs" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
