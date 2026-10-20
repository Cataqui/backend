import { verifyMetaSubscriptionDocs, receiveMetaWebhookDocs } from "./whatsapp.openapi";
import type { AuthWorkerEnv } from "../../cloudflare.config.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthVariables } from "../http/context";
import { MetaWebhookAuthService } from "./meta-webhook-auth.service";
import { WhatsappService } from "./whatsapp.service";
import { MethodNotAllowedError } from "../http/errors/method-not-allowed.error";
import { PayloadTooLargeError } from "../http/errors/payload-too-large.error";
import { MetaSubscriptionVerificationRejectedError } from "./errors/meta-subscription-verification-rejected.error";
import { MetaWebhookSignatureInvalidError } from "./errors/meta-webhook-signature-invalid.error";

export const whatsappRoutes = new Hono<{ Bindings: AuthWorkerEnv; Variables: AuthVariables }>();

whatsappRoutes.use("/", async (context, next) => {
	if (context.req.method !== "GET" && context.req.method !== "POST") {
		context.header("Allow", "GET, POST");
		throw new MethodNotAllowedError();
	}

	return next();
});

whatsappRoutes.use(
	"/",
	bodyLimit({
		maxSize: 10 * 1024 * 1024,
		onError: () => {
			throw new PayloadTooLargeError();
		},
	}),
);

whatsappRoutes.get("/", verifyMetaSubscriptionDocs, async (context) => {
	const query = new URL(context.req.url).searchParams;
	const challenge = await context.var.resolve(MetaWebhookAuthService).getSubscriptionChallengeOrNull({
		challenge: query.get("hub.challenge"),
		mode: query.get("hub.mode"),
		receivedVerificationToken: query.get("hub.verify_token"),
	});
	if (challenge === null) throw new MetaSubscriptionVerificationRejectedError();

	return context.body(challenge, 200, {
		"Content-Type": "text/plain; charset=utf-8",
	});
});

whatsappRoutes.post("/", receiveMetaWebhookDocs, async (context) => {
	const accepted = await context.var.resolve(WhatsappService).receiveMessagesWebhook({
		rawBody: new Uint8Array(await context.req.raw.arrayBuffer()),
		webhookSignature: context.req.header("x-hub-signature-256") ?? null,
	});

	if (!accepted) throw new MetaWebhookSignatureInvalidError();
	return context.body(null, 200);
});
