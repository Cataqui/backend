import type { z } from "zod";
import { inboundCall, type VerifyNotpInputSchema } from "@cataqui/api-internal-ingress";

export class NotpRepository {
	async verifyMessages(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		messages: z.infer<typeof VerifyNotpInputSchema>[];
	}): Promise<void> {
		const responses = await Promise.all(
			params.messages.map((message) =>
				inboundCall({
					worker: params.apiWorker,
					receiver: "verify-whatsapp-notp",
					body: message,
				}),
			),
		);

		if (responses.some((response) => !response.ok)) {
			throw new Error("API Worker rejected WhatsApp NOTP verification");
		}
	}
}
