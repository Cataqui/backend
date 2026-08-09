import { Hono } from "hono";
import { enqueueMessages } from "../../../../queues/queue";
import { getInboundMessageAuthQueueMessageOrNull } from "../inbound-message-auth/inbound-message-auth.utils";
import { isWebhookFromMeta } from "../../shared/meta.utils";
import { getTextMessagesFromWhatsappWebhook } from "./whatsapp-messages-webhook.parser";

export const whatsappRoutes = new Hono<{ Bindings: WebhooksWorkerEnv }>();

whatsappRoutes.use("/", async (context, next) => {
	if (context.req.method !== "GET" && context.req.method !== "POST") {
		return context.body(null, 405, { Allow: "GET, POST" });
	}

	await next();
});

whatsappRoutes.get("/", async (context) => {
	const query = new URL(context.req.url).searchParams;
	const mode = query.get("hub.mode");
	const verifyToken = query.get("hub.verify_token");
	const challenge = query.get("hub.challenge");
	const encoder = new TextEncoder();

	const [configuredTokenHash, receivedTokenHash] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(context.env.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN)),
		crypto.subtle.digest("SHA-256", encoder.encode(verifyToken ?? "")),
	]);

	if (
		mode !== "subscribe" ||
		challenge === null ||
		!crypto.subtle.timingSafeEqual(configuredTokenHash, receivedTokenHash)
	) {
		return context.body(null, 403);
	}

	return context.body(challenge, 200, {
		"Content-Type": "text/plain; charset=utf-8",
	});
});

whatsappRoutes.post("/", async (context) => {
	const rawBody = new Uint8Array(await context.req.raw.arrayBuffer());

	if (
		!(await isWebhookFromMeta({
			rawBody: rawBody,
			webhookSignature: context.req.header("x-hub-signature-256") ?? null,
			appSecret: context.env.META_APP_SECRET,
		}))
	) {
		return context.body(null, 401);
	}

	const receivedTextMessages = getTextMessagesFromWhatsappWebhook({
		requestBody: JSON.parse(new TextDecoder().decode(rawBody)),
	});
	const authQueueMessageCandidates = await Promise.all(
		receivedTextMessages
			.filter((message) => message.recipientPhoneNumberId === context.env.WHATSAPP_AUTH_PHONE_NUMBER_ID)
			.map((message) =>
				getInboundMessageAuthQueueMessageOrNull({
					providerMessageId: message.providerMessageId,
					providerSenderId: message.providerSenderId,
					providerContactIdentifier: message.providerContactIdentifier,
					text: message.text,
				}),
			),
	);
	const authQueueMessages = authQueueMessageCandidates.filter((message) => message !== null);

	if (authQueueMessages.length === 0) return context.body(null, 200);

	await enqueueMessages({
		messages: authQueueMessages,
		queue: context.env.VERIFY_WHATSAPP_AUTH_MESSAGE_QUEUE,
	});

	return context.body(null, 200);
});
