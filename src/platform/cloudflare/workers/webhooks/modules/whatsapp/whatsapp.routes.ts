import { Hono } from "hono";
import { inboundCall } from "../../../../containers/api/inbound/api-container-inbound";
import { isWebhookFromMeta } from "../../shared/meta.utils";
import { getInboundMessageAuthInputOrNull } from "../inbound-message-auth/inbound-message-auth.utils";
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

	const authMessageCandidates = await Promise.all(
		receivedTextMessages
			.filter((message) => message.recipientPhoneNumberId === context.env.WHATSAPP_AUTH_PHONE_NUMBER_ID)
			.map((message) =>
				getInboundMessageAuthInputOrNull({
					providerMessageId: message.providerMessageId,
					providerSenderId: message.providerSenderId,
					providerContactIdentifier: message.providerContactIdentifier,
					text: message.text,
				}),
			),
	);
	const authMessages = authMessageCandidates.filter((message) => message !== null);

	if (authMessages.length === 0) return context.body(null, 200);

	const responses = await Promise.all(
		authMessages.map((message) =>
			inboundCall({
				worker: context.env.API_WORKER,
				receiver: "verify-whatsapp-auth-message",
				body: message,
			}),
		),
	);

	if (responses.some((response) => !response.ok)) throw new Error("API Worker rejected WhatsApp authentication");

	return context.body(null, 200);
});
