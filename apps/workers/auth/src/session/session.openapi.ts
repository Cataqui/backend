import { describeRoute, resolver } from "hono-openapi";
import { AuthenticatedSessionOutputSchema } from "@cataqui/auth-schemas";
import { SessionOutputSchema } from "../session/session-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { authErrorResponse } from "../http/error.openapi";

export const getCurrentSessionDocs = describeRoute({
	operationId: "getCurrentSession",
	responses: {
		default: authErrorResponse,
		"200": {
			description: "Current active session",
			content: {
				"application/json": {
					schema: resolver(createSuccessResponseSchema({ dataSchema: AuthenticatedSessionOutputSchema })),
				},
			},
		},
	},
});

export const refreshSessionDocs = describeRoute({
	operationId: "refreshSession",
	security: [],
	description:
		"Rotate refresh credentials and replace the active access token. Previous refresh credentials have a 60-second recovery window; replay outside it revokes the session.",
	responses: {
		default: authErrorResponse,
		"401": {
			...authErrorResponse,
			description: "Refresh credentials are invalid, expired, or revoked. Start a new login attempt.",
		},
		"200": {
			description: "Session refreshed",
			content: {
				"application/json": { schema: resolver(createSuccessResponseSchema({ dataSchema: SessionOutputSchema })) },
			},
		},
	},
});

export const logoutSessionDocs = describeRoute({
	operationId: "logoutSession",
	security: [],
	description: "Idempotently revoke the session identified by a refresh credential.",
	responses: {
		default: authErrorResponse,
		"204": { description: "Session revoked or already absent" },
	},
});

export const revokeAllSessionsDocs = describeRoute({
	operationId: "revokeAllSessions",
	responses: {
		default: authErrorResponse,
		"204": { description: "All account sessions revoked" },
	},
});
