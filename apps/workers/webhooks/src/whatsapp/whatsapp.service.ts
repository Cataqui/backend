import type { NotpDeliveryTelemetry } from "../notp/notp-delivery-telemetry";
import { NotpService } from "../notp/notp.service";
import { MetaWebhookAuthService } from "./meta-webhook-auth.service";
import { getTextMessagesFromWhatsappWebhook } from "./whatsapp-messages-webhook.parser";

export class WhatsappService {
	constructor(params?: {
		notpService?: NotpService;
		metaWebhookAuthService?: MetaWebhookAuthService;
	}) {
		this._notpService = params?.notpService ?? new NotpService();
		this._metaWebhookAuthService = params?.metaWebhookAuthService ?? new MetaWebhookAuthService();
	}

	private readonly _notpService: NotpService;
	private readonly _metaWebhookAuthService: MetaWebhookAuthService;

	async getSubscriptionChallengeOrNull(params: {
		challenge: string | null;
		configuredVerificationToken: string;
		mode: string | null;
		receivedVerificationToken: string | null;
	}): Promise<string | null> {
		const encoder = new TextEncoder();
		const [configuredTokenHash, receivedTokenHash] = await Promise.all([
			crypto.subtle.digest("SHA-256", encoder.encode(params.configuredVerificationToken)),
			crypto.subtle.digest("SHA-256", encoder.encode(params.receivedVerificationToken ?? "")),
		]);

		if (
			params.mode !== "subscribe" ||
			params.challenge === null ||
			!crypto.subtle.timingSafeEqual(configuredTokenHash, receivedTokenHash)
		) {
			return null;
		}

		return params.challenge;
	}

	async receiveMessagesWebhook(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		appSecret: string;
		notpPhoneNumberId: string;
		rawBody: Uint8Array;
		telemetry: NotpDeliveryTelemetry;
		webhookSignature: string | null;
	}): Promise<boolean> {
		if (
			!(await this._metaWebhookAuthService.isWebhookFromMeta({
				rawBody: params.rawBody,
				webhookSignature: params.webhookSignature,
				appSecret: params.appSecret,
			}))
		) {
			return false;
		}

		const receivedTextMessages = getTextMessagesFromWhatsappWebhook({
			requestBody: JSON.parse(new TextDecoder().decode(params.rawBody)),
		});

		const notpCandidates = await Promise.all(
			receivedTextMessages
				.filter((message) => message.recipientPhoneNumberId === params.notpPhoneNumberId)
				.map((message) =>
					this._notpService.getInputOrNull({
						providerMessageId: message.providerMessageId,
						providerSenderId: message.providerSenderId,
						providerContactIdentifier: message.providerContactIdentifier,
						text: message.text,
					}),
				),
		);

		await this._notpService.verifyInputs({
			apiWorker: params.apiWorker,
			inputs: notpCandidates.filter((message) => message !== null),
			telemetry: params.telemetry,
		});

		return true;
	}
}
