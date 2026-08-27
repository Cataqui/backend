const isWebhookFromMetaMock = vi.hoisted(() => vi.fn());
const timingSafeEqualMock = vi.hoisted(() => vi.fn());

Object.defineProperty(crypto.subtle, "timingSafeEqual", {
	configurable: true,
	value: timingSafeEqualMock,
});

vi.mock("./whatsapp/meta-webhook-auth.service", () => ({
	MetaWebhookAuthService: class {
		isWebhookFromMeta = isWebhookFromMetaMock;
	},
}));

import worker from "./app";

worker.get("/test-returned-server-rejection", (context) => context.body(null, 503));

function _createWebhooksWorkerEnvironment(params: { overrides?: Partial<WebhooksWorkerEnv> } = {}): WebhooksWorkerEnv {
	return {
		API_WORKER: { deliverInbound: vi.fn() },
		META_APP_SECRET: "test-meta-app-secret-at-least-32-characters",
		NODE_ENV: "staging",
		WHATSAPP_NOTP_PHONE_NUMBER_ID: "1211194405413752",
		WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token",
		WORKER_VERSION_METADATA: {
			id: "webhooks-worker-version-id",
			tag: "0123456789abcdef0123456789abcdef01234567",
			timestamp: "2026-08-27T12:00:00.000Z",
		},
		...(params.overrides ?? {}),
	} as WebhooksWorkerEnv;
}

describe("Webhooks Worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		isWebhookFromMetaMock.mockReset();
		isWebhookFromMetaMock.mockResolvedValue(true);
		timingSafeEqualMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should mount the WhatsApp provider module", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await worker.fetch(
			new Request(
				"https://webhooks.cataqui.com/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.status).toBe(200);
	});

	it("should prevent caches from storing WhatsApp subscription verification responses", async () => {
		timingSafeEqualMock.mockReturnValue(true);
		const response = await worker.fetch(
			new Request(
				"https://webhooks.cataqui.com/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value",
			),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should reject routes not owned by the Webhooks Worker", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/health"),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.status).toBe(404);
	});

	it("should return not found for unknown paths inside the WhatsApp provider module", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp/unknown", { method: "PUT" }),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.status).toBe(404);
	});

	it("should prevent caches from storing unknown-route responses", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/health"),
			_createWebhooksWorkerEnvironment(),
		);

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
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.status).toBe(200);
	});

	it("should prevent caches from storing successful webhook acknowledgements", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
			}),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should emit a correlated successful webhook request lifecycle record", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
			}),
			_createWebhooksWorkerEnvironment(),
		);

		expect({
			log: vi.mocked(console.log).mock.calls[0]?.[0],
			responseRequestId: response.headers.get("x-request-id"),
		}).toEqual({
			log: {
				durationMilliseconds: expect.any(Number),
				env: "staging",
				event: "webhooks.request.completed",
				method: "POST",
				outcome: "SUCCESS",
				requestId: response.headers.get("x-request-id"),
				responseStatus: 200,
				route: "/whatsapp",
				service: "cataqui-webhooks-staging",
				version: "0123456789abcdef0123456789abcdef01234567",
			},
			responseRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
		});
	});

	it("should reject request bodies above the Webhooks Worker ten-megabyte limit", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/whatsapp", {
				method: "POST",
				body: "x".repeat(10 * 1024 * 1024 + 1),
			}),
			_createWebhooksWorkerEnvironment(),
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
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should emit a bounded client-rejection lifecycle record with a normalized method", async () => {
		await worker.fetch(
			new Request("https://webhooks.cataqui.com/health?private=value", { method: "CUSTOM" }),
			_createWebhooksWorkerEnvironment({
				overrides: {
					WORKER_VERSION_METADATA: {
						id: "webhooks-worker-version-id",
						tag: "",
						timestamp: "2026-08-27T12:00:00.000Z",
					},
				},
			}),
		);

		expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toEqual({
			durationMilliseconds: expect.any(Number),
			env: "staging",
			event: "webhooks.request.completed",
			method: "_OTHER",
			outcome: "CLIENT_REJECTED",
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			responseStatus: 404,
			route: "UNMATCHED",
			service: "cataqui-webhooks-staging",
			version: "webhooks-worker-version-id",
		});
	});

	it.each(["CONNECT", "DELETE", "HEAD", "OPTIONS", "PATCH", "PUT", "TRACE"])(
		"should preserve the supported %s method in lifecycle telemetry",
		async (requestMethod) => {
			const request = new Request("https://webhooks.cataqui.com/health");
			Object.defineProperty(request, "method", { configurable: true, value: requestMethod });

			await worker.fetch(request, _createWebhooksWorkerEnvironment());

			expect(vi.mocked(console.warn).mock.calls.at(-1)?.[0]).toMatchObject({ method: requestMethod });
		},
	);

	it("should return a safe internal error when a webhook route unexpectedly fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(response.status).toBe(500);
	});

	it("should prevent caches from storing unexpected error responses", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		const response = await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("should log safe request metadata and the failure when a webhook route unexpectedly fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw new Error("secret provider failure");
			},
		}) as WebhooksWorkerEnv;

		await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect({
			loggedFailure: consoleError.mock.calls[0]?.[0],
			privateMessageLogged: JSON.stringify(consoleError.mock.calls).includes("secret provider failure"),
		}).toEqual({
			loggedFailure: {
				durationMilliseconds: expect.any(Number),
				env: "staging",
				errorName: "Error",
				errorStackFrames: expect.stringContaining("app.spec.ts"),
				event: "webhooks.request.failed",
				method: "GET",
				outcome: "THREW",
				requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
				responseStatus: 500,
				route: "/whatsapp",
				service: "cataqui-webhooks-staging",
				version: "0123456789abcdef0123456789abcdef01234567",
			},
			privateMessageLogged: false,
		});
	});

	it("should normalize invalid error names without exposing the provider message", async () => {
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				const error = new Error("private provider failure");
				error.name = "invalid error name";
				throw error;
			},
		}) as WebhooksWorkerEnv;

		await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect({
			leaksFailure: JSON.stringify(vi.mocked(console.error).mock.calls).includes("private provider failure"),
			log: vi.mocked(console.error).mock.calls[0]?.[0],
		}).toEqual({
			leaksFailure: false,
			log: expect.objectContaining({
				errorName: "UnknownError",
				event: "webhooks.request.failed",
				outcome: "THREW",
			}),
		});
	});

	it("should log a stackless thrown error without inventing stack frames", async () => {
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				const error = new Error("private provider failure");
				delete error.stack;
				throw error;
			},
		}) as WebhooksWorkerEnv;

		await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect(vi.mocked(console.error).mock.calls[0]?.[0]).toEqual(
			expect.not.objectContaining({ errorStackFrames: expect.anything() }),
		);
	});

	it("should normalize a non-error thrown value without exposing its contents", async () => {
		const env = Object.defineProperty(_createWebhooksWorkerEnvironment(), "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN", {
			get: () => {
				throw { privateProviderValue: "must-not-be-logged" };
			},
		}) as WebhooksWorkerEnv;

		await worker.fetch(new Request("https://webhooks.cataqui.com/whatsapp"), env);

		expect({
			leaksThrownValue: JSON.stringify(vi.mocked(console.error).mock.calls).includes("must-not-be-logged"),
			log: vi.mocked(console.error).mock.calls[0]?.[0],
		}).toEqual({
			leaksThrownValue: false,
			log: expect.objectContaining({ errorName: "UnknownError", event: "webhooks.request.failed" }),
		});
	});

	it("should log a returned server rejection separately from a thrown request failure", async () => {
		await worker.fetch(
			new Request("https://webhooks.cataqui.com/test-returned-server-rejection"),
			_createWebhooksWorkerEnvironment(),
		);

		expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatchObject({
			event: "webhooks.request.rejected",
			outcome: "REJECTED",
			responseStatus: 503,
		});
	});

	it("should not preserve the previous authentication-specific WhatsApp route", async () => {
		const response = await worker.fetch(
			new Request("https://webhooks.cataqui.com/notp/whatsapp"),
			_createWebhooksWorkerEnvironment(),
		);

		expect(response.status).toBe(404);
	});
});
