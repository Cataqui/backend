import { describeRoute, resolver } from "hono-openapi";
import { NotpIntentExchangeOutputSchema } from "../notp/notp-intent-exchange-output.schema";
import { NotpIntentOutputSchema } from "../notp/notp-intent-output.schema";
import { SessionOutputSchema } from "../session/session-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { authErrorResponse } from "../http/error.openapi";

export const createNotpIntentDocs = describeRoute({
	operationId: "createNotpIntent",
	security: [],
	description: "Create a short-lived WhatsApp login attempt. Send the returned code to codeReceiver.",
	responses: {
		default: authErrorResponse,
		"201": {
			description: "Login intent created",
			content: {
				"application/json": { schema: resolver(createSuccessResponseSchema({ dataSchema: NotpIntentOutputSchema })) },
			},
		},
	},
});

export const exchangeNotpIntentDocs = describeRoute({
	operationId: "exchangeNotpIntent",
	security: [],
	description:
		"Wait up to 20 seconds for verification. Pending responses include Retry-After; retry using the same intentToken. Verified exchanges can be retried during the intent recovery window.",
	responses: {
		default: authErrorResponse,
		"404": {
			...authErrorResponse,
			description: "Login intent was not found or has expired. Create a new intent.",
		},
		"201": {
			description: "Session issued",
			content: {
				"application/json": { schema: resolver(createSuccessResponseSchema({ dataSchema: SessionOutputSchema })) },
			},
		},
		"202": {
			description: "Verification pending",
			headers: {
				"Retry-After": { schema: { type: "integer" }, description: "Minimum seconds before retrying" },
			},
			content: {
				"application/json": {
					schema: resolver(createSuccessResponseSchema({ dataSchema: NotpIntentExchangeOutputSchema })),
				},
			},
		},
	},
});
