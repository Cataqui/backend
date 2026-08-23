export class MetaWebhookAuthService {
	async isWebhookFromMeta(params: {
		appSecret: string;
		rawBody: Uint8Array;
		webhookSignature: string | null;
	}): Promise<boolean> {
		const webhookSignatureBytes = this._getSha256SignatureBytesOrNull({
			webhookSignature: params.webhookSignature,
		});
		if (webhookSignatureBytes === null) return false;

		const hmacKey = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(params.appSecret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);

		return crypto.subtle.verify("HMAC", hmacKey, webhookSignatureBytes, params.rawBody);
	}

	private _getSha256SignatureBytesOrNull(params: { webhookSignature: string | null }): Uint8Array | null {
		const signatureMatch = /^sha256=([0-9a-f]{64})$/.exec(params.webhookSignature ?? "");
		const signatureHex = signatureMatch?.[1];

		if (signatureHex === undefined) return null;

		const signatureBytes = new Uint8Array(signatureHex.length / 2);

		for (let byteIndex = 0; byteIndex < signatureBytes.length; byteIndex += 1) {
			const signatureHexPairStartIndex = byteIndex * 2;
			signatureBytes[byteIndex] = Number.parseInt(
				signatureHex.slice(signatureHexPairStartIndex, signatureHexPairStartIndex + 2),
				16,
			);
		}

		return signatureBytes;
	}
}
