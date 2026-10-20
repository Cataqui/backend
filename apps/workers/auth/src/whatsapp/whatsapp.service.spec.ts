import { createHash } from "node:crypto";
import * as td from "testdouble";
import { NotpChannel } from "../notp/notp-channel.enum";
import type { NotpService } from "../notp/notp.service";
import type { MetaWebhookAuthService } from "./meta-webhook-auth.service";
import { WhatsappService } from "./whatsapp.service";

afterEach(() => td.reset());
afterEach(() => vi.restoreAllMocks());

function _buildPayload(params?: {
	body?: string;
	contactIdentifier?: string | null;
	phoneNumberId?: string;
}): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
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
									phone_number_id: params?.phoneNumberId ?? "notp-number",
								},
								contacts:
									params?.contactIdentifier === null
										? []
										: [
												{
													profile: { name: "Maria", username: params?.contactIdentifier ?? "maria" },
													user_id: "sender-id",
												},
											],
								messages: [
									{
										id: "message-id",
										from_user_id: "sender-id",
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
		}),
	);
}

describe("WhatsappService", () => {
	const originalToHex = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toHex");
	const toHex = td.func<Uint8Array["toHex"]>();
	let notpService: NotpService;
	let metaWebhookAuthService: MetaWebhookAuthService;
	let service: WhatsappService;

	beforeAll(() => {
		Object.defineProperty(Uint8Array.prototype, "toHex", { configurable: true, value: toHex });
	});

	afterAll(() => {
		if (originalToHex === undefined) Reflect.deleteProperty(Uint8Array.prototype, "toHex");
		else Object.defineProperty(Uint8Array.prototype, "toHex", originalToHex);
	});

	beforeEach(() => {
		td.when(toHex()).thenReturn(createHash("sha256").update("NOTP-K7F9Q2M8VD").digest("hex"));
		notpService = td.object<NotpService>();
		metaWebhookAuthService = td.object<MetaWebhookAuthService>();
		service = new WhatsappService(notpService, metaWebhookAuthService, {
			whatsappPhoneNumber: "+5511963270517",
			whatsappPhoneNumberId: "notp-number",
		});
		td.when(metaWebhookAuthService.isWebhookFromMeta(td.matchers.anything())).thenResolve(true);
		td.when(notpService.verifyNotp(td.matchers.anything())).thenResolve(undefined);
	});

	it("authenticates the original bytes before parsing provider input", async () => {
		const rawBody = new TextEncoder().encode("invalid JSON");
		td.when(metaWebhookAuthService.isWebhookFromMeta(td.matchers.anything())).thenResolve(false);

		await expect(
			service.receiveMessagesWebhook({
				rawBody: rawBody,
				webhookSignature: "signature",
			}),
		).resolves.toBe(false);

		td.verify(
			metaWebhookAuthService.isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: "signature",
			}),
		);
		expect(td.explain(notpService.verifyNotp).callCount).toBe(0);
	});

	it("hashes the single code and explicitly maps the verified WhatsApp identity", async () => {
		const digest = vi.spyOn(crypto.subtle, "digest");

		await expect(
			service.receiveMessagesWebhook({
				rawBody: _buildPayload({ body: "Olá notp-k7f9q2m8vd!" }),
				webhookSignature: "signature",
			}),
		).resolves.toBe(true);

		td.verify(
			notpService.verifyNotp({
				channel: NotpChannel.WHATSAPP,
				providerMessageId: "message-id",
				providerSubject: "sender-id",
				contactIdentifier: "maria",
				providerProfileName: "Maria",
				notpCodeHash: createHash("sha256").update("NOTP-K7F9Q2M8VD").digest("hex"),
			}),
		);
		expect(digest).toHaveBeenCalledWith("SHA-256", new TextEncoder().encode("NOTP-K7F9Q2M8VD"));
	});

	it.each(["Olá", "NOTP-K7F9Q2M8VD NOTP-AAAAAAAAAA", "xNOTP-K7F9Q2M8VD", "NOTP-K7F9Q2M8VDx"])(
		"acknowledges text without one unambiguous standalone code: %s",
		async (text) => {
			await expect(
				service.receiveMessagesWebhook({
					rawBody: _buildPayload({ body: text }),
					webhookSignature: "signature",
				}),
			).resolves.toBe(true);
			expect(td.explain(notpService.verifyNotp).callCount).toBe(0);
		},
	);

	it("ignores codes received by another WhatsApp number", async () => {
		await expect(
			service.receiveMessagesWebhook({
				rawBody: _buildPayload({ phoneNumberId: "another-number" }),
				webhookSignature: "signature",
			}),
		).resolves.toBe(true);
		expect(td.explain(notpService.verifyNotp).callCount).toBe(0);
	});

	it("fails a relevant code without a contact identifier", async () => {
		await expect(
			service.receiveMessagesWebhook({
				rawBody: _buildPayload({ contactIdentifier: null }),
				webhookSignature: "signature",
			}),
		).rejects.toThrow("NOTP requires a provider contact identifier");
	});

	it("leaves verification failures retryable instead of acknowledging them", async () => {
		const error = new Error("Verification unavailable");
		td.when(notpService.verifyNotp(td.matchers.anything())).thenReject(error);

		await expect(
			service.receiveMessagesWebhook({
				rawBody: _buildPayload(),
				webhookSignature: "signature",
			}),
		).rejects.toBe(error);
	});

	it("propagates signed malformed JSON as a retryable provider processing failure", async () => {
		await expect(
			service.receiveMessagesWebhook({
				rawBody: new TextEncoder().encode("invalid JSON"),
				webhookSignature: "signature",
			}),
		).rejects.toBeInstanceOf(SyntaxError);
	});
});
