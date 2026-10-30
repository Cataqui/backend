import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { ContactMethod } from "../../../../generated/prisma/client";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ContactOutputSchema } from "../../contact/schemas/contact-output.schema";

export function ApiGetJobContactDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ContactOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiOperation({ summary: "Get an active job's contact details" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Contact details for the active job.",
			example: {
				data: { method: ContactMethod.WHATSAPP, identifier: "+12025550123" },
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/jobs/00000000-0000-4000-8000-000000000002/contact/00000000-0000-4000-8000-000000000003",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
			headers: {
				"Cache-Control": {
					description: "Prevents storing the contact identifier.",
					schema: { type: "string", example: "no-store" satisfies string },
				},
			},
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: {
				...apiInternalErrorExample,
				endpoint: "/v1/jobs/00000000-0000-4000-8000-000000000002/contact/00000000-0000-4000-8000-000000000003",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The job is unavailable or does not use this contact.",
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
