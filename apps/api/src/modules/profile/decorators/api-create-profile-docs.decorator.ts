import { ErrorCode } from "../../../core/errors/error-code.enum";
import { CreateProfileInputSchema } from "../schemas/create-profile-input.schema";
import type { z } from "zod";
import { apiInternalErrorExample, apiValidationErrorExample } from "../../../core/errors/api-error.examples";
import { profileExample } from "../profile.examples";
import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBody, ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { ProfileOutputSchema } from "../schemas/profile-output.schema";

export function ApiCreateProfileDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: ProfileOutputSchema });
	return applyDecorators(
		// Swagger merges these examples with the Standard Schema supplied by @Body.
		ApiBody({
			schema: {},
			examples: {
				withoutContacts: {
					summary: "Example submission",
					value: { name: "Maria Clara", initialContacts: [] } satisfies z.input<typeof CreateProfileInputSchema>,
				},
			},
		}),
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Create your profile",
			description: "Creates the authenticated account's profile",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Profile created.",
			example: {
				data: profileExample,
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/profiles",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The same profile creation was already completed.",
			example: {
				data: profileExample,
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/profiles",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			examples: {
				unexpected: {
					summary: "Unexpected failure",
					value: { ...apiInternalErrorExample, endpoint: "/v1/profiles" } satisfies z.output<
						typeof ApiErrorResponseOutputSchema
					>,
				},
				invalidFields: {
					summary: "Correct the invalid fields",
					value: {
						...apiValidationErrorExample,
						endpoint: "/v1/profiles",
						violations: [{ path: ["name"], message: "name must contain at least one non-whitespace character" }],
					} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
				},
			},
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description: "A profile already exists with different onboarding information (PROFILE_CREATION_CONFLICT).",
			example: {
				...apiInternalErrorExample,
				status: 409,
				errorCode: ErrorCode.PROFILE_CREATION_CONFLICT,
				message: "A profile was already created with different onboarding information.",
				endpoint: "/v1/profiles",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
