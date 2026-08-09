import type { z } from "zod";
import { InboundMessageAuthQueueMessageSchema } from "../../../../queues/schemas/inbound-message-auth-queue-message.schema";

export async function getInboundMessageAuthQueueMessageOrNull(params: {
	providerMessageId: string;
	providerSenderId: string;
	providerContactIdentifier: string | undefined;
	text: string;
}): Promise<z.infer<typeof InboundMessageAuthQueueMessageSchema> | null> {
	const authCode = _extractAuthCodeFromText(params.text);
	if (authCode === null) return null;
	if (params.providerContactIdentifier === undefined) {
		throw new Error("Inbound-message authentication requires a provider contact identifier");
	}

	return {
		providerMessageId: params.providerMessageId,
		providerSenderId: params.providerSenderId,
		providerContactIdentifier: params.providerContactIdentifier,
		authCodeHash: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authCode))).toHex(),
	};
}

function _extractAuthCodeFromText(text: string): string | null {
	const matches = text.match(/(?<![A-Z0-9])AUTH-[A-Z0-9]{10}(?![A-Z0-9])/giu);
	if (matches === null || matches.length !== 1) return null;

	return matches[0]?.toUpperCase() ?? null;
}
