import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { ContactMethod } from "../../../../generated/prisma/client";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { SavedContactsOutputSchema } from "../../contact/schemas/saved-contacts-output.schema";

export function ApiGetCurrentProfileContactsDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: SavedContactsOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get saved contacts",
			description: "Returns the authenticated profile's contacts available for job posts",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Saved contacts returned for the authenticated profile.",
			example: {
				data: [
					{
						contactId: "00000000-0000-4000-8000-000000000003",
						method: ContactMethod.WHATSAPP,
						identifier: "+12025550123",
					},
				],
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/profiles/me/contacts",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/profiles/me/contacts" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
