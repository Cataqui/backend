import { AppError } from "../errors/app.error";
import type { AuthWorkerEnv } from "../../cloudflare.config.ts";
import { Hono } from "hono";
import * as td from "testdouble";
import type { AuthVariables } from "../http/context";
import { container } from "tsyringe";
import { MetaWebhookAuthService } from "./meta-webhook-auth.service";
import { WhatsappService } from "./whatsapp.service";

const { getSubscriptionChallengeOrNull, receiveMessagesWebhook } = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		getSubscriptionChallengeOrNull: td.func<MetaWebhookAuthService["getSubscriptionChallengeOrNull"]>(),
		receiveMessagesWebhook: td.func<WhatsappService["receiveMessagesWebhook"]>(),
	};
});

vi.mock("./meta-webhook-auth.service", () => ({
	MetaWebhookAuthService: class {
		getSubscriptionChallengeOrNull = getSubscriptionChallengeOrNull;
	},
}));

vi.mock("./whatsapp.service", () => ({
	WhatsappService: class {
		receiveMessagesWebhook = receiveMessagesWebhook;
	},
}));

import { whatsappRoutes } from "./whatsapp.routes";

afterEach(() => td.reset());

describe("WhatsApp routes", () => {
	const app = new Hono<{ Bindings: AuthWorkerEnv; Variables: AuthVariables }>();
	app.use("*", async (context, next) => {
		const scope = container.createChildContainer();
		scope.registerInstance(
			MetaWebhookAuthService,
			Object.assign(td.object<MetaWebhookAuthService>(), {
				getSubscriptionChallengeOrNull: getSubscriptionChallengeOrNull,
			}),
		);
		scope.registerInstance(
			WhatsappService,
			Object.assign(td.object<WhatsappService>(), { receiveMessagesWebhook: receiveMessagesWebhook }),
		);
		context.set("resolve", (token) => scope.resolve(token));

		try {
			await next();
		} finally {
			await scope.dispose();
		}
	});
	app.route("/webhooks/whatsapp", whatsappRoutes);
	app.onError((error, context) => context.body(null, error instanceof AppError ? error.status : 500));

	let env: AuthWorkerEnv;

	beforeEach(() => {
		env = Object.assign(td.object<AuthWorkerEnv>(), {
			META_APP_SECRET: "app-secret",
			WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token",
			WHATSAPP_NOTP_PHONE_NUMBER_ID: "notp-number",
		});
		td.when(getSubscriptionChallengeOrNull(td.matchers.anything())).thenResolve("challenge-value");
		td.when(receiveMessagesWebhook(td.matchers.anything())).thenResolve(true);
	});

	it("returns the approved challenge verbatim as plain text", async () => {
		const response = await app.request(
			"/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=received-token&hub.challenge=challenge-value",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		expect(await response.text()).toBe("challenge-value");
		td.verify(
			getSubscriptionChallengeOrNull({
				challenge: "challenge-value",
				mode: "subscribe",
				receivedVerificationToken: "received-token",
			}),
		);
	});

	it("passes missing subscription fields as absence and rejects an unapproved challenge", async () => {
		td.when(getSubscriptionChallengeOrNull(td.matchers.anything())).thenResolve(null);

		const response = await app.request("/webhooks/whatsapp", {}, env);

		expect(response.status).toBe(403);
		td.verify(
			getSubscriptionChallengeOrNull({
				challenge: null,
				mode: null,
				receivedVerificationToken: null,
			}),
		);
	});

	it("passes the exact body and signature to the provider boundary", async () => {
		const response = await app.request(
			"/webhooks/whatsapp",
			{ method: "POST", headers: { "x-hub-signature-256": "signature" }, body: '{  "entry": [] }' },
			env,
		);

		expect(response.status).toBe(200);
		td.verify(
			receiveMessagesWebhook({
				rawBody: new TextEncoder().encode('{  "entry": [] }'),
				webhookSignature: "signature",
			}),
		);
	});

	it("rejects an invalid or missing signature", async () => {
		td.when(receiveMessagesWebhook(td.matchers.anything())).thenResolve(false);

		const response = await app.request("/webhooks/whatsapp", { method: "POST", body: "body" }, env);

		expect(response.status).toBe(401);
		td.verify(
			receiveMessagesWebhook({
				rawBody: new TextEncoder().encode("body"),
				webhookSignature: null,
			}),
		);
	});

	it("leaves delivery failures as retryable server errors", async () => {
		td.when(receiveMessagesWebhook(td.matchers.anything())).thenReject(new Error("Verification unavailable"));

		const response = await app.request("/webhooks/whatsapp", { method: "POST", body: "body" }, env);

		expect(response.status).toBe(500);
	});

	it("rejects a body exceeding the provider limit before calling the service", async () => {
		const response = await app.request(
			"/webhooks/whatsapp",
			{ method: "POST", body: "x".repeat(10 * 1024 * 1024 + 1) },
			env,
		);

		expect(response.status).toBe(413);
		expect(td.explain(receiveMessagesWebhook).callCount).toBe(0);
	});

	it.each(["PUT", "HEAD", "DELETE"])("rejects unsupported %s requests with the supported methods", async (method) => {
		const response = await app.request("/webhooks/whatsapp", { method: method }, env);

		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, POST");
	});
});
