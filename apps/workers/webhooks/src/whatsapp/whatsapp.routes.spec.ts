const isWebhookFromMetaMock = vi.hoisted(() => vi.fn());
const timingSafeEqualMock = vi.hoisted(() => vi.fn());

Object.defineProperty(crypto.subtle, "timingSafeEqual", {
	configurable: true,
	value: timingSafeEqualMock,
});

vi.mock("./meta-webhook-auth.service", () => ({
	MetaWebhookAuthService: class {
		isWebhookFromMeta = isWebhookFromMetaMock;
	},
}));

import { createWhatsappRoutes } from "./whatsapp.routes";

const whatsappRoutes = createWhatsappRoutes();

const webhookSigningSecret = "test-meta-app-secret-at-least-32-characters";

function _buildPayload(params?: {
	body?: string;
	contacts?: unknown[];
	messageId?: string;
	messages?: unknown[];
	phoneNumberId?: string;
}): Record<string, unknown> {
	return {
		object: "whatsapp_business_account",
		entry: [
			{
				id: "waba-id",
				changes: [
					{
						field: "messages",
						value: {
							messaging_product: "whatsapp",
							metadata: {
								display_phone_number: "+1 555 0100",
								phone_number_id: params?.phoneNumberId ?? "1234567890",
							},
							contacts: params?.contacts ?? [
								{
									profile: { name: "Cataqui User", username: "cataqui.user" },
									user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
								},
							],
							messages: params?.messages ?? [
								{
									id: params?.messageId ?? "wamid.message",
									from_user_id: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
									timestamp: "1786172400",
									type: "text",
									text: { body: params?.body ?? "NOTP-K7F9Q2M8VD" },
								},
							],
						},
					},
				],
			},
		],
	};
}

function _buildEnv(deliverInbound: ReturnType<typeof vi.fn>): WebhooksWorkerEnv {
	return {
		NODE_ENV: "staging",
		META_APP_SECRET: webhookSigningSecret,
		WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token",
		WHATSAPP_NOTP_PHONE_NUMBER_ID: "1234567890",
		API_WORKER: { deliverInbound: deliverInbound },
		WORKER_VERSION_METADATA: {
			id: "webhooks-worker-version-id",
			tag: "webhooks-worker-version",
			timestamp: "2026-08-27T12:00:00.000Z",
		},
	} as never;
}

function _buildPostRequest(rawBody: string): Request {
	return new Request("https://webhooks.cataqui.com/", {
		method: "POST",
		headers: { "x-hub-signature-256": "sha256=test-signature" },
		body: rawBody.length === 0 ? null : rawBody,
	});
}

describe("WhatsApp routes", () => {
	const originalToHex = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toHex");

	beforeAll(() => {
		Object.defineProperty(Uint8Array.prototype, "toHex", {
			configurable: true,
			value: vi.fn().mockReturnValue("a".repeat(64)),
		});
	});

	afterAll(() => {
		if (originalToHex === undefined) {
			Reflect.deleteProperty(Uint8Array.prototype, "toHex");
			return;
		}

		Object.defineProperty(Uint8Array.prototype, "toHex", originalToHex);
	});

	beforeEach(() => {
		isWebhookFromMetaMock.mockReset();
		timingSafeEqualMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should return Meta's challenge for a valid WhatsApp subscription request", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await whatsappRoutes.fetch(
			new Request(
				"https://webhooks.cataqui.com/?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(await response.text()).toBe("challenge-value");
	});

	it("should reject a WhatsApp subscription request with a different verification token", async () => {
		timingSafeEqualMock.mockReturnValue(false);
		const response = await whatsappRoutes.fetch(
			new Request(
				"https://webhooks.cataqui.com/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-value",
			),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(403);
	});

	it("should reject a WhatsApp subscription request outside subscribe mode", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await whatsappRoutes.fetch(
			new Request(
				"https://webhooks.cataqui.com/?hub.mode=unsubscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(403);
	});

	it("should reject a WhatsApp subscription request without a verification token", async () => {
		timingSafeEqualMock.mockReturnValue(false);
		const response = await whatsappRoutes.fetch(
			new Request("https://webhooks.cataqui.com/?hub.mode=subscribe&hub.challenge=challenge-value"),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(403);
	});

	it("should reject a WhatsApp subscription request without a challenge", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await whatsappRoutes.fetch(
			new Request("https://webhooks.cataqui.com/?hub.mode=subscribe&hub.verify_token=verify-token"),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(403);
	});

	it("should authenticate the untouched raw WhatsApp webhook body", async () => {
		isWebhookFromMetaMock.mockResolvedValue(false);
		const rawBody = JSON.stringify(_buildPayload());

		await whatsappRoutes.fetch(_buildPostRequest(rawBody), _buildEnv(vi.fn()));

		expect(isWebhookFromMetaMock).toHaveBeenCalledWith({
			rawBody: new TextEncoder().encode(rawBody),
			webhookSignature: "sha256=test-signature",
			appSecret: webhookSigningSecret,
		});
	});

	it("should reject a WhatsApp webhook that was not signed by Meta", async () => {
		isWebhookFromMetaMock.mockResolvedValue(false);

		const response = await whatsappRoutes.fetch(_buildPostRequest(JSON.stringify(_buildPayload())), _buildEnv(vi.fn()));

		expect(response.status).toBe(401);
	});

	it("should acknowledge unrelated WhatsApp text without contacting the API Worker", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);
		const deliverInbound = vi.fn();

		const response = await whatsappRoutes.fetch(
			_buildPostRequest(JSON.stringify(_buildPayload({ body: "Olá" }))),
			_buildEnv(deliverInbound),
		);

		expect({ status: response.status, verificationCalls: deliverInbound.mock.calls.length }).toEqual({
			status: 200,
			verificationCalls: 0,
		});
	});

	it("should acknowledge malformed NOTP text without contacting the API Worker", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);
		const deliverInbound = vi.fn();

		const response = await whatsappRoutes.fetch(
			_buildPostRequest(JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD NOTP-AAAAAAAAAA" }))),
			_buildEnv(deliverInbound),
		);

		expect({ status: response.status, verificationCalls: deliverInbound.mock.calls.length }).toEqual({
			status: 200,
			verificationCalls: 0,
		});
	});

	it("should send a normalized NOTP message directly to the API Worker", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);
		const deliverInbound = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

		await whatsappRoutes.fetch(
			_buildPostRequest(JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD" }))),
			_buildEnv(deliverInbound),
		);

		expect(deliverInbound).toHaveBeenCalledWith({
			receiver: "verify-whatsapp-notp",
			body: {
				providerMessageId: "wamid.message",
				providerSenderId: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
				providerContactIdentifier: "cataqui.user",
				notpCodeHash: "a".repeat(64),
			},
		});
	});

	it("should send a burst of valid NOTP messages directly to the API Worker without queueing", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);
		const deliverInbound = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

		const responses = await Promise.all(
			Array.from({ length: 300 }, (_, messageIndex) =>
				whatsappRoutes.fetch(
					_buildPostRequest(
						JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD", messageId: `wamid.burst-${messageIndex}` })),
					),
					_buildEnv(deliverInbound),
				),
			),
		);

		expect({
			responseStatuses: new Set(responses.map((response) => response.status)),
			verificationCallCount: deliverInbound.mock.calls.length,
		}).toEqual({ responseStatuses: new Set([200]), verificationCallCount: 300 });
	});

	it("should ignore NOTP messages received by a different WhatsApp number", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);
		const deliverInbound = vi.fn();

		const response = await whatsappRoutes.fetch(
			_buildPostRequest(
				JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD", phoneNumberId: "different-phone-number-id" })),
			),
			_buildEnv(deliverInbound),
		);

		expect({ status: response.status, verificationCalls: deliverInbound.mock.calls.length }).toEqual({
			status: 200,
			verificationCalls: 0,
		});
	});

	it("should return 500 when the API Worker cannot verify a valid NOTP message", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);

		const response = await whatsappRoutes.fetch(
			_buildPostRequest(JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD" }))),
			_buildEnv(vi.fn().mockRejectedValue(new Error("API unavailable"))),
		);

		expect(response.status).toBe(500);
	});

	it("should return 500 when the API Worker rejects a valid NOTP message", async () => {
		isWebhookFromMetaMock.mockResolvedValue(true);

		const response = await whatsappRoutes.fetch(
			_buildPostRequest(JSON.stringify(_buildPayload({ body: "NOTP-K7F9Q2M8VD" }))),
			_buildEnv(vi.fn().mockResolvedValue(new Response(null, { status: 500 }))),
		);

		expect(response.status).toBe(500);
	});

	it("should reject unsupported methods at the WhatsApp route", async () => {
		const response = await whatsappRoutes.fetch(
			new Request("https://webhooks.cataqui.com/", { method: "PUT" }),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(405);
	});

	it("should reject implicit HEAD requests at the WhatsApp route", async () => {
		const response = await whatsappRoutes.fetch(
			new Request("https://webhooks.cataqui.com/", { method: "HEAD" }),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(405);
	});

	it("should advertise the methods supported by the WhatsApp route", async () => {
		const response = await whatsappRoutes.fetch(
			new Request("https://webhooks.cataqui.com/", { method: "PUT" }),
			{} as WebhooksWorkerEnv,
		);

		expect(response.headers.get("Allow")).toBe("GET, POST");
	});
});
