import { RefreshTokenInputSchema } from "./refresh-token-input.schema";
import { issuedSessionExample } from "../session/session.examples";
import type { z } from "zod";
import { AuthErrorResponseOutputSchema } from "../http/auth-error-response-output.schema";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { describeRoute, resolver } from "hono-openapi";
import { AuthenticatedSessionOutputSchema } from "@cataqui/auth-schemas";
import { SessionOutputSchema } from "../session/session-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { authErrorResponse, authInternalErrorExample } from "../http/error.openapi";

const _currentSessionResponseSchema = createSuccessResponseSchema({ dataSchema: AuthenticatedSessionOutputSchema });
const _issuedSessionResponseSchema = createSuccessResponseSchema({ dataSchema: SessionOutputSchema });

export const getCurrentSessionDocs = describeRoute({
	operationId: "getCurrentSession",
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/sessions/current" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"200": {
			description: "Current active session",
			content: {
				"application/json": {
					schema: resolver(_currentSessionResponseSchema),
					example: {
						data: {
							accountId: "00000000-0000-4000-8000-000000000001",
							sessionId: "00000000-0000-4000-8000-000000000005",
							expiresAt: "2026-10-30T12:15:00.000Z",
						},
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/sessions/current",
					} satisfies z.output<typeof _currentSessionResponseSchema>,
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
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(RefreshTokenInputSchema, { options: { io: "input" } }),
				example: { refreshToken: "example-refresh-token" } satisfies z.input<typeof RefreshTokenInputSchema>,
			},
		},
	},
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/sessions/refresh" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"401": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						status: 401,
						errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
						message: "The refresh token is invalid",
						endpoint: "/v1/sessions/refresh",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			description: "Refresh credentials are invalid, expired, or revoked. Start a new login attempt.",
		},
		"200": {
			description: "Session refreshed",
			content: {
				"application/json": {
					schema: resolver(_issuedSessionResponseSchema),
					example: {
						data: issuedSessionExample,
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/sessions/refresh",
					} satisfies z.output<typeof _issuedSessionResponseSchema>,
				},
			},
		},
	},
});

export const logoutSessionDocs = describeRoute({
	operationId: "logoutSession",
	security: [],
	description: "Idempotently revoke the session identified by a refresh credential.",
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(RefreshTokenInputSchema, { options: { io: "input" } }),
				example: { refreshToken: "example-refresh-token" } satisfies z.input<typeof RefreshTokenInputSchema>,
			},
		},
	},
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/sessions/logout" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"204": { description: "Session revoked or already absent" },
	},
});

export const revokeAllSessionsDocs = describeRoute({
	operationId: "revokeAllSessions",
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/sessions" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"204": { description: "All account sessions revoked" },
	},
});
