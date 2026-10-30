import type { z } from "zod";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { AuthErrorResponseOutputSchema } from "../http/auth-error-response-output.schema";
import { WhatsappMessagesWebhookValueSchema } from "./schemas/whatsapp-messages-webhook-value.schema";
import { describeRoute, resolver } from "hono-openapi";
import { authErrorResponse, authInternalErrorExample } from "../http/error.openapi";
import { WhatsappMessagesWebhookSchema } from "./schemas/whatsapp-messages-webhook.schema";

export const verifyMetaSubscriptionDocs = describeRoute({
	operationId: "verifyMetaSubscription",
	security: [],
	parameters: ["hub.mode", "hub.verify_token", "hub.challenge"].map((name) => ({
		name: name,
		in: "query",
		required: true,
		schema: { type: "string" },
	})),
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/webhooks/whatsapp" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"403": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						status: 403,
						errorCode: AppErrorCode.META_SUBSCRIPTION_VERIFICATION_REJECTED,
						message: "The subscription verification was rejected.",
						endpoint: "/webhooks/whatsapp",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			description: "Subscription verification was rejected. Check the verification token and challenge parameters.",
		},
		"405": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						status: 405,
						errorCode: AppErrorCode.METHOD_NOT_ALLOWED,
						message: "The requested HTTP method is not supported.",
						endpoint: "/webhooks/whatsapp",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			headers: { Allow: { schema: { type: "string", enum: ["GET, POST"] } } },
		},
		"200": { description: "Verified challenge", content: { "text/plain": { schema: { type: "string" } } } },
	},
});

export const receiveMetaWebhookDocs = describeRoute({
	operationId: "receiveMetaWebhook",
	security: [],
	description:
		"Authenticate the exact raw request body with X-Hub-Signature-256 before parsing. Accepted callbacks are acknowledged only after verification processing completes.",
	parameters: [{ name: "X-Hub-Signature-256", in: "header", required: true, schema: { type: "string" } }],
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(WhatsappMessagesWebhookSchema, { options: { io: "input" } }),
				example: {
					object: "whatsapp_business_account",
					entry: [
						{
							id: "example-business-account",
							changes: [
								{
									field: "messages",
									value: {
										messaging_product: "whatsapp",
										metadata: { display_phone_number: "12025550123", phone_number_id: "example-phone-id" },
										contacts: [{ profile: { name: "Maria Clara" }, wa_id: "12025550124" }],
										messages: [
											{
												from: "12025550124",
												id: "example-message-id",
												timestamp: "1793361600",
												type: "text",
												text: { body: "NOTP-EXAMP12345" },
											},
										],
									} satisfies z.input<typeof WhatsappMessagesWebhookValueSchema>,
								},
							],
						},
					],
				} satisfies z.input<typeof WhatsappMessagesWebhookSchema>,
			},
		},
	},
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/webhooks/whatsapp" } satisfies z.output<
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
						errorCode: AppErrorCode.META_WEBHOOK_SIGNATURE_INVALID,
						message: "The webhook signature is invalid.",
						endpoint: "/webhooks/whatsapp",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			description: "Webhook signature is missing or invalid. Sign the exact request body with X-Hub-Signature-256.",
		},
		"405": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						status: 405,
						errorCode: AppErrorCode.METHOD_NOT_ALLOWED,
						message: "The requested HTTP method is not supported.",
						endpoint: "/webhooks/whatsapp",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			headers: { Allow: { schema: { type: "string", enum: ["GET, POST"] } } },
		},
		"200": { description: "Callback accepted" },
	},
});
