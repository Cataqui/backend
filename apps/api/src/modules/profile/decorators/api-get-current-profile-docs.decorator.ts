import { ErrorCode } from "../../../core/errors/error-code.enum";
import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { profileExample } from "../profile.examples";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { ProfileOutputSchema } from "../schemas/profile-output.schema";

export function ApiGetCurrentProfileDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileOutputSchema });

	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get current profile",
			description: "Returns information about the authenticated profile.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Current profile returned.",
			example: {
				data: profileExample,
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/profiles/me",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "The authenticated account has not created a profile (PROFILE_NOT_FOUND).",
			example: {
				...apiInternalErrorExample,
				status: 404,
				errorCode: ErrorCode.PROFILE_NOT_FOUND,
				message: "The authenticated account has no Cataquí profile.",
				endpoint: "/v1/profiles/me",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/profiles/me" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
