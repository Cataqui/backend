import { getWorkerVersion } from "@cataqui/observability-contracts";
import { Hono } from "hono";
import { WhatsappService } from "./whatsapp.service";

export function createWhatsappRoutes(params?: { service?: WhatsappService }): Hono<WebhooksWorkerHonoEnvironment> {
	const whatsappRoutes = new Hono<WebhooksWorkerHonoEnvironment>();
	const service = params?.service ?? new WhatsappService();

	whatsappRoutes.use("/", async (context, next) => {
		if (context.req.method !== "GET" && context.req.method !== "POST") {
			return context.body(null, 405, { Allow: "GET, POST" });
		}

		return next();
	});

	whatsappRoutes.get("/", async (context) => {
		const query = new URL(context.req.url).searchParams;
		const challenge = await service.getSubscriptionChallengeOrNull({
			challenge: query.get("hub.challenge"),
			configuredVerificationToken: context.env.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN,
			mode: query.get("hub.mode"),
			receivedVerificationToken: query.get("hub.verify_token"),
		});
		if (challenge === null) return context.body(null, 403);

		return context.body(challenge, 200, {
			"Content-Type": "text/plain; charset=utf-8",
		});
	});

	whatsappRoutes.post("/", async (context) => {
		const accepted = await service.receiveMessagesWebhook({
			apiWorker: context.env.API_WORKER,
			appSecret: context.env.META_APP_SECRET,
			notpPhoneNumberId: context.env.WHATSAPP_NOTP_PHONE_NUMBER_ID,
			rawBody: new Uint8Array(await context.req.raw.arrayBuffer()),
			telemetry: {
				environment: context.env.NODE_ENV,
				requestId: context.get("requestId") ?? crypto.randomUUID(),
				serviceVersion: getWorkerVersion({ metadata: context.env.WORKER_VERSION_METADATA }),
			},
			webhookSignature: context.req.header("x-hub-signature-256") ?? null,
		});

		return context.body(null, accepted ? 200 : 401);
	});

	return whatsappRoutes;
}
