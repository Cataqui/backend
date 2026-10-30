import type { z } from "zod";
import { apiInternalErrorExample } from "../../../core/errors/api-error.examples";
import { AccountAdmission } from "../../../../generated/prisma/enums";
import { createSuccessResponseSchema } from "@cataqui/response";
import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { AccountOutputSchema } from "../schemas/account-output.schema";

export function ApiGetAccountDocs(): MethodDecorator & ClassDecorator {
	const responseSchema = createSuccessResponseSchema({ dataSchema: AccountOutputSchema });
	return applyDecorators(
		SerializeOptions({ schema: responseSchema }),
		ApiBearerAuth(),
		ApiOperation({
			summary: "Get current account",
			description: "Returns the authenticated account, creating it if needed.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Current account returned.",
			example: {
				data: {
					id: "00000000-0000-4000-8000-000000000001",
					admission: AccountAdmission.ADMITTED,
					onboardingCompleted: true,
				},
				requestId: "example-request",
				timestamp: "2026-10-30T12:00:00.000Z",
				endpoint: "/v1/account",
			} satisfies z.output<typeof responseSchema>,
			standardSchema: responseSchema,
		}),
		ApiResponse({
			status: "default",
			description: "Application error. Inspect status, errorCode, and any validation violations.",
			example: { ...apiInternalErrorExample, endpoint: "/v1/account" } satisfies z.output<
				typeof ApiErrorResponseOutputSchema
			>,
			standardSchema: ApiErrorResponseOutputSchema,
		}),
	);
}
