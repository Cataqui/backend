import type { z } from "zod";
import type { VerifyNotpInputSchema } from "@cataqui/api-internal-ingress";
import { NotpRepository } from "./notp.repository";

export class NotpService {
	constructor(params?: { repository?: NotpRepository }) {
		this._repository = params?.repository ?? new NotpRepository();
	}

	private readonly _repository: NotpRepository;

	async getInputOrNull(params: {
		providerMessageId: string;
		providerSenderId: string;
		providerContactIdentifier: string | undefined;
		text: string;
	}): Promise<z.infer<typeof VerifyNotpInputSchema> | null> {
		const notpCodeMatches = params.text.match(/(?<![A-Z0-9])NOTP-[A-Z0-9]{10}(?![A-Z0-9])/giu);
		if (notpCodeMatches === null || notpCodeMatches.length !== 1) return null;

		const notpCode = notpCodeMatches[0]?.toUpperCase();
		if (notpCode === undefined) return null;

		if (params.providerContactIdentifier === undefined) {
			throw new Error("NOTP requires a provider contact identifier");
		}

		return {
			providerMessageId: params.providerMessageId,
			providerSenderId: params.providerSenderId,
			providerContactIdentifier: params.providerContactIdentifier,
			notpCodeHash: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(notpCode))).toHex(),
		};
	}

	async verifyInputs(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		inputs: z.infer<typeof VerifyNotpInputSchema>[];
	}): Promise<void> {
		if (params.inputs.length === 0) return;

		await this._repository.verifyMessages({ apiWorker: params.apiWorker, messages: params.inputs });
	}
}
