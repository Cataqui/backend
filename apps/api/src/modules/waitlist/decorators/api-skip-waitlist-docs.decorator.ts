import { ErrorCode } from "../../../core/errors/error-code.enum";
import { SkipWaitlistInputSchema } from "../schemas/skip-waitlist-input.schema";
import type { z } from "zod";
import { apiInternalErrorExample, apiValidationErrorExample } from "../../../core/errors/api-error.examples";
import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBody, ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";

export function ApiSkipWaitlistDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		// Swagger merges these examples with the Standard Schema supplied by @Body.
		ApiBody({
			schema: {},
			examples: {
				inviteCode: {
					summary: "Example submission",
					value: { inviteCode: "EXAMPLE-2026" } satisfies z.input<typeof SkipWaitlistInputSchema>,
				},
			},
		}),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Skip the waitlist",
			description:
				"Admits an account using an invite code and records its referral. Joining the waitlist first is not required. Already admitted accounts succeed without changing attribution or consuming invite capacity, regardless of the supplied code.",
		}),
		ApiResponse({
			status: HttpStatus.NO_CONTENT,
			description: "The account was admitted or already had access. No response body.",
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description:
				"The account already has invite attribution (ACCOUNT_INVITE_ALREADY_SET). Its referral cannot be changed.",
			example: {
				...apiInternalErrorExample,
				status: 409,
				errorCode: ErrorCode.ACCOUNT_INVITE_ALREADY_SET,
				message: "The account's invite code has already been set and cannot be changed.",
				endpoint: "/v1/waitlist/skip",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: HttpStatus.UNPROCESSABLE_ENTITY,
			description:
				"For accounts that are not admitted, the code is unknown, disabled, or exhausted (INVITE_UNAVAILABLE). Try another code; admission and attribution were not changed.",
			example: {
				...apiInternalErrorExample,
				status: 422,
				errorCode: ErrorCode.INVITE_UNAVAILABLE,
				message:
					"The supplied inviteCode is unknown, disabled, or has reached its usage limit. Use another invite code.",
				endpoint: "/v1/waitlist/skip",
			} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			examples: {
				unexpected: {
					summary: "Unexpected failure",
					value: { ...apiInternalErrorExample, endpoint: "/v1/waitlist/skip" } satisfies z.output<
						typeof ApiErrorResponseOutputSchema
					>,
				},
				invalidFields: {
					summary: "Correct the invalid fields",
					value: {
						...apiValidationErrorExample,
						endpoint: "/v1/waitlist/skip",
						violations: [
							{ path: ["inviteCode"], message: "inviteCode must contain at least one letter, digit, or hyphen" },
						],
					} satisfies z.output<typeof ApiErrorResponseOutputSchema>,
				},
			},
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
