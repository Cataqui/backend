import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { ContactMethod, JobStatus } from "../../../../generated/prisma/client";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ProfileJobOutputSchema } from "../../job/schemas/profile-job-output.schema";

export function ApiGetProfileJobDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileJobOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({ summary: "Get one of the authenticated profile's posted jobs" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Posted job returned.",
			example: {
				data: {
					jobId: "00000000-0000-4000-8000-000000000002",
					description: "Ajuda para montar mesas no sábado, das 9h às 13h. R$ 120 no dia.",
					contact: { method: ContactMethod.WHATSAPP, identifier: "+12025550123" },
					location: {
						title: "Centro de Osasco",
						latitude: -23.532,
						longitude: -46.792,
						areaRadius: 300,
						imageUrl: "https://maps.example.com/static/v1/example.webp",
					},
					status: JobStatus.ACTIVE,
					createdAt: "2026-10-30T12:00:00.000Z",
					updatedAt: "2026-10-30T12:00:00.000Z",
				},
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/profiles/me/jobs/00000000-0000-4000-8000-000000000002",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: {
				...apiInternalErrorExample,
				endpoint: "/v1/profiles/me/jobs/00000000-0000-4000-8000-000000000002",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job owned by the authenticated profile exists with the supplied job ID.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
