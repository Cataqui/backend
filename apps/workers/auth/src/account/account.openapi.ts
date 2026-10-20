import { describeRoute, resolver } from "hono-openapi";
import { AccountOutputSchema } from "../account/account-output.schema";
import { authErrorResponse } from "../http/error.openapi";
import { createSuccessResponseSchema } from "@cataqui/response";

export const getCurrentAccountDocs = describeRoute({
	operationId: "getCurrentAccount",
	description: "Return the account and verified linked identities.",
	responses: {
		default: authErrorResponse,
		"200": {
			description: "Current account",
			content: {
				"application/json": { schema: resolver(createSuccessResponseSchema({ dataSchema: AccountOutputSchema })) },
			},
		},
	},
});
