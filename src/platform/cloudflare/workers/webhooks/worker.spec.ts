const isWebhookFromMetaMock = vi.hoisted(() => vi.fn());
const timingSafeEqualMock = vi.hoisted(() => vi.fn());

Object.defineProperty(crypto.subtle, "timingSafeEqual", {
	configurable: true,
	value: timingSafeEqualMock,
});

vi.mock("./shared/meta.utils", () => ({
	isWebhookFromMeta: isWebhookFromMetaMock,
}));

import worker from "./worker";

describe("Webhooks Worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		isWebhookFromMetaMock.mockReset();
		isWebhookFromMetaMock.mockResolvedValue(true);
		timingSafeEqualMock.mockReset();
	});

	it("should mount the WhatsApp provider module", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await worker.fetch(
			new Request(
				"https://webhooks.cataqui.com/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(200);
	});

	it("should prevent caches from storing WhatsApp subscription verification responses", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await worker.fetch(
			new Request(
				"https://webhooks.cataqui.com/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			{ WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token" } as WebhooksWorkerEnv,
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should reject routes not owned by the Webhooks Worker", async () => {
		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/health"), {} as WebhooksWorkerEnv);

		expect(response.status).toBe(404);
	});

	it("should return not found for unknown paths inside the WhatsApp provider module", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp/unknown", { method: "PUT" }),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(404);
	});

	it("should prevent caches from storing unknown-route responses", async () => {
		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/health"), {} as WebhooksWorkerEnv);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should allow request bodies at the Webhooks Worker ten-megabyte limit", async () => {
		const bodyPrefix = `{"object":"whatsapp_business_account","entry":[],"padding":"`;
		const bodySuffix = `"}`;
		const body = `${bodyPrefix}${"x".repeat(10 * 1024 * 1024 - bodyPrefix.length - bodySuffix.length)}${bodySuffix}`;
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: body,
			}),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(200);
	});

	it("should prevent caches from storing successful webhook acknowledgements", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
			}),
			{} as WebhooksWorkerEnv,
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should reject request bodies above the Webhooks Worker ten-megabyte limit", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: "x".repeat(10 * 1024 * 1024 + 1),
			}),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(413);
	});

	it("should prevent caching of oversized-request responses", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				headers: { "Content-Length": String(10 * 1024 * 1024 + 1) },
				body: "x",
			}),
			{} as WebhooksWorkerEnv,
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should return a safe internal error when a webhook route unexpectedly fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty({}, "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(response.status).toBe(500);
	});

	it("should prevent caches from storing unexpected error responses", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty({}, "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should log safe request metadata and the failure when a webhook route unexpectedly fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty({}, "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(consoleError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "webhooks.request.failed",
				method: "GET",
				path: "/whatsapp",
				responseStatus: 500,
				errorName: "Error",
				errorMessage: "secret provider failure",
				errorStack: expect.stringContaining("secret provider failure"),
			}),
		);
	});

	it("should not preserve the previous authentication-specific WhatsApp route", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/inbound-message-auth/whatsapp"),
			{} as WebhooksWorkerEnv,
		);

		expect(response.status).toBe(404);
	});
});
