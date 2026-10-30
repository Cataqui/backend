import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";

import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { createPaginatedSuccessResponseSchema } from "@cataqui/response";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { FeedItemOutputSchema } from "../schemas/feed-item-output.schema";

export function ApiGetFeedDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createPaginatedSuccessResponseSchema({ itemSchema: FeedItemOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({
			summary: "Get feed of active jobs",
			description: "Returns a cursor-paginated feed of active jobs in the server-defined order.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Feed items retrieved successfully",
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
								createdAt: "2026-10-30T12:00:00.000Z",
							},
						],
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/feed",
						pagination: { hasMore: false, nextCursor: null },
					} satisfies z.output<typeof responseSchema>,
				},
				empty: {
					summary: "No jobs available",
					value: {
						data: [],
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/feed",
						pagination: { hasMore: false, nextCursor: null },
					} satisfies z.output<typeof responseSchema>,
				},
			},
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/feed" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
