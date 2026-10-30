import type { z } from "zod";
import { AuthErrorResponseOutputSchema } from "../http/auth-error-response-output.schema";

import { describeRoute, resolver } from "hono-openapi";
import { AccountOutputSchema } from "../account/account-output.schema";
import { authErrorResponse, authInternalErrorExample } from "../http/error.openapi";
import { createSuccessResponseSchema } from "@cataqui/response";

const _accountResponseSchema = createSuccessResponseSchema({ dataSchema: AccountOutputSchema });

export const getCurrentAccountDocs = describeRoute({
	operationId: "getCurrentAccount",
	description: "Return the account and verified linked identities.",
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/account" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"200": {
			description: "Current account",
			content: {
				"application/json": {
					schema: resolver(_accountResponseSchema),
					example: {
						data: {
							accountId: "00000000-0000-4000-8000-000000000001",
							identities: [
								{
									identityId: "00000000-0000-4000-8000-000000000004",
									provider: "WHATSAPP",
									identifier: "12025550123",
									displayIdentifier: "+12025550123",
									lastVerifiedAt: "2026-10-30T12:00:00.000Z",
								},
							],
						},
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/account",
					} satisfies z.output<typeof _accountResponseSchema>,
				},
			},
		},
	},
});
