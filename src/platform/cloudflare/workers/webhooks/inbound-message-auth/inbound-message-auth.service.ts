import type { z } from "zod";
import type { VerifyInboundMessageAuthInputSchema } from "../../../containers/api/inbound/schemas/verify-inbound-message-auth-input.schema";
import { InboundMessageAuthRepository } from "./inbound-message-auth.repository";

export class InboundMessageAuthService {
	constructor(params?: { repository?: InboundMessageAuthRepository }) {
		this._repository = params?.repository ?? new InboundMessageAuthRepository();
	}

	private readonly _repository: InboundMessageAuthRepository;

	async getInputOrNull(params: {
		providerMessageId: string;
		providerSenderId: string;
		providerContactIdentifier: string | undefined;
		text: string;
	}): Promise<z.infer<typeof VerifyInboundMessageAuthInputSchema> | null> {
		const authCodeMatches = params.text.match(/(?<![A-Z0-9])AUTH-[A-Z0-9]{10}(?![A-Z0-9])/giu);
		if (authCodeMatches === null || authCodeMatches.length !== 1) return null;

		const authCode = authCodeMatches[0]?.toUpperCase();
		if (authCode === undefined) return null;

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

	async verifyInputs(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		inputs: z.infer<typeof VerifyInboundMessageAuthInputSchema>[];
	}): Promise<void> {
		if (params.inputs.length === 0) return;

		await this._repository.verifyMessages({ apiWorker: params.apiWorker, messages: params.inputs });
	}
}
