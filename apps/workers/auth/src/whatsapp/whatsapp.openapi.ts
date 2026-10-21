import { describeRoute, resolver } from "hono-openapi";
import { authErrorResponse } from "../http/error.openapi";
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
		default: authErrorResponse,
		"403": {
			...authErrorResponse,
			description: "Subscription verification was rejected. Check the verification token and challenge parameters.",
		},
		"405": { ...authErrorResponse, headers: { Allow: { schema: { type: "string", enum: ["GET, POST"] } } } },
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
			"application/json": { schema: resolver(WhatsappMessagesWebhookSchema, { options: { io: "input" } }) },
		},
	},
	responses: {
		default: authErrorResponse,
		"401": {
			...authErrorResponse,
			description: "Webhook signature is missing or invalid. Sign the exact request body with X-Hub-Signature-256.",
		},
		"405": { ...authErrorResponse, headers: { Allow: { schema: { type: "string", enum: ["GET, POST"] } } } },
		"200": { description: "Callback accepted" },
	},
});
