import { CreateNotpIntentInputSchema } from "./create-notp-intent-input.schema";
import { ExchangeNotpIntentInputSchema } from "./exchange-notp-intent-input.schema";
import { NotpChannel } from "./notp-channel.enum";
import { NotpIntentStatus } from "./notp-intent-status.enum";
import { issuedSessionExample } from "../session/session.examples";
import type { z } from "zod";
import { AuthErrorResponseOutputSchema } from "../http/auth-error-response-output.schema";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { describeRoute, resolver } from "hono-openapi";
import { NotpIntentExchangeOutputSchema } from "../notp/notp-intent-exchange-output.schema";
import { NotpIntentOutputSchema } from "../notp/notp-intent-output.schema";
import { SessionOutputSchema } from "../session/session-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { authErrorResponse, authInternalErrorExample } from "../http/error.openapi";

const _intentResponseSchema = createSuccessResponseSchema({ dataSchema: NotpIntentOutputSchema });
const _issuedSessionResponseSchema = createSuccessResponseSchema({ dataSchema: SessionOutputSchema });
const _exchangeResponseSchema = createSuccessResponseSchema({ dataSchema: NotpIntentExchangeOutputSchema });

export const createNotpIntentDocs = describeRoute({
	operationId: "createNotpIntent",
	security: [],
	description: "Create a short-lived WhatsApp login attempt. Send the returned code to codeReceiver.",
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(CreateNotpIntentInputSchema, { options: { io: "input" } }),
				example: { channel: NotpChannel.WHATSAPP } satisfies z.input<typeof CreateNotpIntentInputSchema>,
			},
		},
	},
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/notp/intents" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"201": {
			description: "Login intent created",
			content: {
				"application/json": {
					schema: resolver(_intentResponseSchema),
					example: {
						data: {
							intentToken: "A".repeat(43),
							code: "NOTP-EXAMP12345",
							codeReceiver: "+12025550123",
							expiresAt: "2026-10-30T12:05:00.000Z",
						},
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/notp/intents",
					} satisfies z.output<typeof _intentResponseSchema>,
				},
			},
		},
	},
});

export const exchangeNotpIntentDocs = describeRoute({
	operationId: "exchangeNotpIntent",
	security: [],
	description:
		"Wait up to 20 seconds for verification. Pending responses include Retry-After; retry using the same intentToken. Verified exchanges can be retried during the intent recovery window.",
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(ExchangeNotpIntentInputSchema, { options: { io: "input" } }),
				example: { intentToken: "A".repeat(43) } satisfies z.input<typeof ExchangeNotpIntentInputSchema>,
			},
		},
	},
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/notp/intents/exchange" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"404": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						status: 404,
						errorCode: AppErrorCode.NOTP_INTENT_NOT_FOUND,
						message: "The NOTP intent was not found or has expired. Create a new intent.",
						endpoint: "/v1/notp/intents/exchange",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			description: "Login intent was not found or has expired. Create a new intent.",
		},
		"201": {
			description: "Session issued",
			content: {
				"application/json": {
					schema: resolver(_issuedSessionResponseSchema),
					example: {
						data: issuedSessionExample,
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/notp/intents/exchange",
					} satisfies z.output<typeof _issuedSessionResponseSchema>,
				},
			},
		},
		"202": {
			description: "Verification pending",
			headers: {
				"Retry-After": { schema: { type: "integer" }, description: "Minimum seconds before retrying" },
			},
			content: {
				"application/json": {
					schema: resolver(_exchangeResponseSchema),
					examples: {
						pending: {
							summary: "Waiting for WhatsApp verification",
							value: {
								data: { status: NotpIntentStatus.PENDING, retryAfterSeconds: 2 },
								requestId: "example-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/v1/notp/intents/exchange",
							} satisfies z.output<typeof _exchangeResponseSchema>,
						},
					},
				},
			},
		},
	},
});
