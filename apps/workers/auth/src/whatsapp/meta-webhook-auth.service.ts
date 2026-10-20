import { inject, injectable } from "tsyringe";

import { MetaWebhookConfig } from "./meta-webhook.config";

@injectable()
export class MetaWebhookAuthService {
	constructor(@inject(MetaWebhookConfig) private readonly _config: MetaWebhookConfig) {}
	async getSubscriptionChallengeOrNull(params: {
		challenge: string | null;
		mode: string | null;
		receivedVerificationToken: string | null;
	}): Promise<string | null> {
		const encoder = new TextEncoder();
		const [configuredTokenHash, receivedTokenHash] = await Promise.all([
			crypto.subtle.digest("SHA-256", encoder.encode(this._config.verificationToken)),
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

	async isWebhookFromMeta(params: { rawBody: Uint8Array; webhookSignature: string | null }): Promise<boolean> {
		const signatureHex = /^sha256=([0-9a-f]{64})$/.exec(params.webhookSignature ?? "")?.[1];
		if (signatureHex === undefined) return false;

		return crypto.subtle.verify(
			"HMAC",
			await crypto.subtle.importKey(
				"raw",
				new TextEncoder().encode(this._config.appSecret),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["verify"],
			),
			Uint8Array.fromHex(signatureHex),
			params.rawBody,
		);
	}
}
