import { WhatsappContactIdentifierRequiredError } from "./errors/whatsapp-contact-identifier-required.error";
import { inject, injectable } from "tsyringe";
import { NotpChannel } from "../notp/notp-channel.enum";
import { NotpService } from "../notp/notp.service";
import { MetaWebhookAuthService } from "./meta-webhook-auth.service";
import { getTextMessagesFromWhatsappWebhook } from "./whatsapp-messages-webhook.parser";

import { NotpConfig } from "../notp/notp.config";

@injectable()
export class WhatsappService {
	constructor(
		private readonly _notpService: NotpService,
		private readonly _metaWebhookAuthService: MetaWebhookAuthService,
		@inject(NotpConfig) private readonly _notpConfig: NotpConfig,
	) {}

	async receiveMessagesWebhook(params: { rawBody: Uint8Array; webhookSignature: string | null }): Promise<boolean> {
		const signedByMeta = await this._metaWebhookAuthService.isWebhookFromMeta({
			rawBody: params.rawBody,
			webhookSignature: params.webhookSignature,
		});
		if (!signedByMeta) return false;

		const messages = getTextMessagesFromWhatsappWebhook({
			requestBody: JSON.parse(new TextDecoder().decode(params.rawBody)),
		});

		await Promise.all(
			messages.map(async (message) => {
				if (message.recipientPhoneNumberId !== this._notpConfig.whatsappPhoneNumberId) return;

				const codeMatches = message.text.match(/(?<![A-Z0-9])NOTP-[A-Z0-9]{10}(?![A-Z0-9])/giu);
				if (codeMatches === null || codeMatches.length !== 1) return;

				const notpCode = codeMatches[0]?.toUpperCase();
				if (notpCode === undefined) return;
				if (message.contactIdentifier === undefined) {
					throw new WhatsappContactIdentifierRequiredError();
				}

				await this._notpService.verifyNotp({
					channel: NotpChannel.WHATSAPP,
					providerMessageId: message.messageId,
					providerSubject: message.senderId,
					contactIdentifier: message.contactIdentifier,
					providerProfileName: message.profileName,
					notpCodeHash: new Uint8Array(
						await crypto.subtle.digest("SHA-256", new TextEncoder().encode(notpCode)),
					).toHex(),
				});
			}),
		);

		return true;
	}
}
